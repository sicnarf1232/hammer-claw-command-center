import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

// Price-import engine (Phase 3): engine + rulesets, same philosophy as the
// pdf-redaction skill. Parsing, header signatures, mapping application, and
// the commit plan are all pure (given bytes/rows in) and unit-tested. The AI
// only PROPOSES a column mapping; Jordan confirms it, and the confirmed
// mapping is saved as a named reusable ruleset keyed by the header signature.

export interface ParsedSheet {
  headers: string[];
  rows: string[][]; // data rows, aligned to headers
}

export function parseSpreadsheet(bytes: Uint8Array): ParsedSheet {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    dateNF: "yyyy-mm-dd",
  }) as unknown as string[][];
  const nonEmpty = grid.filter((r) => r.some((c) => String(c ?? "").trim()));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => String(h ?? "").trim());
  const rows = nonEmpty
    .slice(1)
    .map((r) => headers.map((_, i) => String(r[i] ?? "").trim()));
  return { headers, rows };
}

// A source's export format is identified by its ordered headers, not its
// filename: same columns, same ruleset.
export function headerSignature(headers: string[]): string {
  const normalized = headers.map((h) => h.trim().toLowerCase()).join("");
  return createHash("sha256").update(normalized).digest("hex");
}

export const MAPPABLE_FIELDS = [
  "part_number",
  "unit_price",
  "account",
  "min_qty",
  "effective_date",
  "expires",
] as const;
export type MappableField = (typeof MAPPABLE_FIELDS)[number];

export interface ColumnMapping {
  // field -> header name in this file (null = not present)
  columns: Partial<Record<MappableField, string | null>>;
  defaults: {
    origin: "contract" | "legacy" | "negotiated" | "catalog-override";
    currency: string;
  };
}

export interface AgreementDraft {
  rowIndex: number;
  partNumber: string;
  unitPrice: number;
  currency: string;
  minQty: number;
  effectiveDate: string; // ISO
  expires: string | null; // ISO or null = grandfathered
  origin: string;
  accountName: string | null; // from the file, when mapped (picker overrides)
}

export interface RowIssue {
  rowIndex: number;
  issue: string;
}

export function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseDateISO(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdY = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdY) {
    const [, m, d, y] = mdY;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

// Apply a confirmed mapping to parsed rows. Pure: bad rows become issues, not
// exceptions; nothing is written here.
export function applyMapping(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  today: string,
): { drafts: AgreementDraft[]; issues: RowIssue[] } {
  const col = (field: MappableField): number => {
    const name = mapping.columns[field];
    if (!name) return -1;
    return sheet.headers.findIndex(
      (h) => h.trim().toLowerCase() === name.trim().toLowerCase(),
    );
  };
  const idx = {
    part: col("part_number"),
    price: col("unit_price"),
    account: col("account"),
    minQty: col("min_qty"),
    effective: col("effective_date"),
    expires: col("expires"),
  };

  const drafts: AgreementDraft[] = [];
  const issues: RowIssue[] = [];
  sheet.rows.forEach((row, rowIndex) => {
    const part = idx.part >= 0 ? row[idx.part]?.trim() : "";
    const priceRaw = idx.price >= 0 ? row[idx.price] : "";
    if (!part && !priceRaw) return; // blank-ish row: skip silently
    if (!part) {
      issues.push({ rowIndex, issue: "missing part number" });
      return;
    }
    const price = parsePrice(priceRaw ?? "");
    if (price == null) {
      issues.push({ rowIndex, issue: `unparseable price "${priceRaw}"` });
      return;
    }
    const minQtyRaw = idx.minQty >= 0 ? row[idx.minQty] : "";
    const minQty = minQtyRaw ? Math.max(1, Math.round(Number(minQtyRaw.replace(/[,\s]/g, "")))) : 1;
    if (!Number.isFinite(minQty)) {
      issues.push({ rowIndex, issue: `unparseable quantity "${minQtyRaw}"` });
      return;
    }
    const effective =
      (idx.effective >= 0 ? parseDateISO(row[idx.effective] ?? "") : null) ?? today;
    const expiresRaw = idx.expires >= 0 ? (row[idx.expires] ?? "").trim() : "";
    const expires = expiresRaw ? parseDateISO(expiresRaw) : null;
    if (expiresRaw && !expires) {
      issues.push({ rowIndex, issue: `unparseable expiry "${expiresRaw}"` });
      return;
    }
    drafts.push({
      rowIndex,
      partNumber: part,
      unitPrice: price,
      currency: mapping.defaults.currency || "USD",
      minQty,
      effectiveDate: effective,
      expires,
      origin: mapping.defaults.origin,
      accountName: idx.account >= 0 ? row[idx.account]?.trim() || null : null,
    });
  });
  return { drafts, issues };
}

export interface ExistingAgreement {
  id: number;
  accountId: number;
  partNumber: string;
  minQty: number;
  effectiveDate: string;
  expires: string | null;
  supersededBy: number | null;
}

export interface CommitPlan {
  insert: Array<AgreementDraft & { accountId: number }>;
  // Existing in-date rows for the same (account, part, tier) that the new row
  // replaces; superseded_by is stamped after the insert returns its id.
  supersede: Array<{ existingId: number; byInsertIndex: number }>;
}

// Pure commit plan: an incoming agreement supersedes any live (non-superseded,
// in-date) prior row for the same account + part + tier.
export function planAgreementCommit(
  existing: ExistingAgreement[],
  drafts: Array<AgreementDraft & { accountId: number }>,
  today: string,
): CommitPlan {
  const live = existing.filter(
    (e) =>
      e.supersededBy == null &&
      e.effectiveDate <= today &&
      (e.expires == null || e.expires >= today),
  );
  const plan: CommitPlan = { insert: drafts, supersede: [] };
  drafts.forEach((d, byInsertIndex) => {
    for (const e of live) {
      if (
        e.accountId === d.accountId &&
        e.partNumber.trim().toLowerCase() === d.partNumber.trim().toLowerCase() &&
        e.minQty === d.minQty
      ) {
        plan.supersede.push({ existingId: e.id, byInsertIndex });
      }
    }
  });
  return plan;
}
