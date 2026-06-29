// Quote business logic: every value the generator derives rather than takes
// verbatim. Pure functions, unit-tested, no I/O. House style: no em dashes.

import type { Closing, QuoteLineItem } from "@/lib/quote/types";

// ---- Quote ID derivation -------------------------------------------------

// Replace any run of characters outside [A-Za-z0-9_.-] with a single "_",
// then trim leading/trailing "_".
export function sanitize(s: string): string {
  return s
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Parse a human or ISO date string into {y, m, d}. Accepts "June 26, 2026",
// "2026-06-26", "06/26/2026", "6/26/26". Returns null when unparseable.
export function parseDateParts(
  input: string,
): { y: number; m: number; d: number } | null {
  const s = input.trim();
  if (!s) return null;

  // ISO YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };

  // Month name, Day, Year ("June 26, 2026" / "Jun 26 2026")
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return { y: +m[3], m: mon, d: +m[2] };
  }

  // Numeric M/D/Y or M/D/YY
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return { y, m: +m[1], d: +m[2] };
  }
  return null;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

// Two-digit month, day, year separated by "." (e.g. "06.26.26").
export function formatMMDDYY(input: string): string {
  const p = parseDateParts(input);
  if (!p) return "";
  return `${pad2(p.m)}.${pad2(p.d)}.${pad2(p.y % 100)}`;
}

// Render a date as the canonical "Month Day, Year" used on the document.
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export function formatLongDate(input: string): string {
  const p = parseDateParts(input);
  if (!p) return input.trim();
  return `${MONTH_NAMES[p.m - 1]} ${p.d}, ${p.y}`;
}

export function deriveQuoteId(args: {
  customerShort?: string;
  customerName?: string;
  quoteDate?: string;
  quoteShort?: string;
}): string {
  const shortSource =
    (args.customerShort && args.customerShort.trim()) ||
    firstWord(args.customerName ?? "");
  const customer = sanitize(shortSource);
  const date = formatMMDDYY(args.quoteDate ?? "");
  const tag = sanitize(args.quoteShort ?? "");
  return [customer, date, tag].filter(Boolean).join("_");
}

function firstWord(s: string): string {
  return s.trim().split(/\s+/)[0] ?? "";
}

// ---- Customer-name & contact normalization -------------------------------

// Canonical spellings for entities that arrive under several names. Keyed by a
// normalized form (lowercase, alphanumerics only). Extend as new ones appear.
const CANONICAL_CUSTOMERS: Record<string, string> = {
  strykernv: "Stryker Neurovascular",
  strykerneurovascular: "Stryker Neurovascular",
  baltusa: "Balt",
  balt: "Balt",
  wlgore: "WL Gore",
  wgore: "WL Gore",
  gore: "WL Gore",
};

function customerKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeCustomerName(input: string): string {
  const raw = input.trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const canonical = CANONICAL_CUSTOMERS[customerKey(raw)];
  return canonical ?? raw;
}

// Title-case a free-text contact name ("duran yetkinler" -> "Duran Yetkinler").
// Preserves all-caps initials runs lightly by just capitalizing each word.
export function titleCaseContact(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) =>
      w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w,
    )
    .join(" ");
}

// ---- Quote-tag (quote_short) suggestion ----------------------------------

export const CATEGORY_ACRONYMS: Record<string, string> = {
  "tuohy borst valves": "TBV",
  "vaclok syringes": "Vac",
  "medallion syringes": "Med",
  "sheath introducers & dilators": "SI",
  "sheath introducers and dilators": "SI",
  "coaxial introducers kits": "CI",
  "coaxial introducers / dilator pair": "CID",
  "hemostasis valves": "HV",
  "advanced needles": "Needle",
  "prelude dilators": "PD",
  "prelude obturators": "PO",
  "vessel dilators": "VD",
  "high pressure tubing": "HPT",
  "pressure monitoring tubing": "PMT",
  "drainage bags": "DB",
  "scalpels": "Scalpel",
  "over the needle (otn)": "OTN",
  "over the needle": "OTN",
};

// Suggest a filename tag from the categories present in a quote.
// 1 category -> its acronym; 2 -> joined with "_"; 3+ -> "PartsQuote".
export function suggestQuoteTag(categories: string[]): string {
  const acronyms: string[] = [];
  for (const c of categories) {
    const a = CATEGORY_ACRONYMS[c.trim().toLowerCase()];
    if (a && !acronyms.includes(a)) acronyms.push(a);
  }
  if (acronyms.length === 0) return "";
  if (acronyms.length === 1) return acronyms[0];
  if (acronyms.length === 2) return `${acronyms[0]}_${acronyms[1]}`;
  return "PartsQuote";
}

// ---- Sterility inference -------------------------------------------------

export interface SterilityResult {
  closing: Closing; // "" when the rule cannot decide
  ask: boolean; // true => surface an "Ask" badge in the UI
}

const NEEDS_ASK_WORDS = ["needle", "hemostasis valve", "y-valve"];

// Drive the per-row closing value from a price-list PN. Rules apply in order;
// "P" suffix is the master indicator and beats everything below it.
export function inferSterility(
  partNo: string,
  description = "",
): SterilityResult {
  const pn = partNo.trim();
  const upper = pn.toUpperCase();

  // NRE and TBD never receive a closing.
  if (upper === "NRE" || upper === "TBD" || upper.startsWith("TBD")) {
    return { closing: "", ask: false };
  }

  // Tolerate trailing "*" bookkeeping markers (non-stocked notes).
  const core = pn.replace(/\*+$/, "");
  const coreUpper = core.toUpperCase();

  // 1. Ends in P -> Bulk Non-Sterile.
  if (/P$/.test(coreUpper)) return { closing: "Bulk Non-Sterile.", ask: false };

  // 2. Ends in C (rare) -> Sterile
  if (/C$/.test(coreUpper)) return { closing: "Sterile", ask: false };

  // 3. Starts with K0n- and no P suffix -> Sterile
  if (/^K\d{2}-/.test(coreUpper)) return { closing: "Sterile", ask: false };

  // 4 & 5. All-numeric starting 5 or 7 -> Bulk Non-Sterile.
  if (/^\d+$/.test(core)) {
    if (core.startsWith("5") || core.startsWith("7")) {
      return { closing: "Bulk Non-Sterile.", ask: false };
    }
    return { closing: "", ask: true };
  }

  // 6. Named SKU: alpha-led and contains a dash -> Sterile, unless the
  // description flags a needle/hemostasis/y-valve (then Ask).
  if (/^[A-Za-z]/.test(core) && core.includes("-")) {
    const d = description.toLowerCase();
    if (NEEDS_ASK_WORDS.some((w) => d.includes(w))) {
      return { closing: "", ask: true };
    }
    return { closing: "Sterile", ask: false };
  }

  // 7. Anything else -> Ask.
  return { closing: "", ask: true };
}

// Default lead time for a real (price-list-resolved) part by sterility.
// NRE / TBD / unknown -> empty (user provides).
export function defaultLeadTime(closing: Closing): string {
  if (closing === "Bulk Non-Sterile.") return "4-6 weeks";
  if (closing === "Sterile") return "6-8 weeks";
  return "";
}

// ---- leadTimeSummary composition -----------------------------------------

// Compose the page-N "Lead time for first order is ..." sentence so repeated
// PNs do not get repeated phrases. Groups items by their plain lead time.
export function composeLeadTimeSummary(items: QuoteLineItem[]): string {
  const groups = new Map<string, string[]>(); // lead -> distinct partNos (in order)
  for (const it of items) {
    const lead = (it.leadStacked ? it.leadAlt : it.leadTime).trim();
    if (!lead) continue;
    const pn = it.partNo.trim();
    if (!pn) continue;
    const list = groups.get(lead) ?? [];
    if (!list.includes(pn)) list.push(pn);
    groups.set(lead, list);
  }

  const phrases: string[] = [];
  for (const [lead, pns] of groups) {
    if (pns.length === 0) continue;
    if (pns.length >= 4) {
      phrases.push(`${lead} for subsequent production parts`);
    } else {
      phrases.push(`${lead} for ${pns.join(", ")}`);
    }
  }

  let joined: string;
  if (phrases.length === 0) return "";
  if (phrases.length === 1) joined = phrases[0];
  else if (phrases.length === 2) joined = `${phrases[0]}, & ${phrases[1]}`;
  else joined = `${phrases.slice(0, -1).join(", ")}, & ${phrases[phrases.length - 1]}`;

  return `Lead time for first order is ${joined}.`;
}

// ---- Quantity formatting -------------------------------------------------

// Add thousands separators when the value is a plain integer; otherwise pass
// through unchanged ("1 lot" stays "1 lot").
export function formatQuantity(q: string): string {
  const s = q.trim();
  const cleaned = s.replace(/,/g, "");
  if (/^\d+$/.test(cleaned)) {
    return new Intl.NumberFormat("en-US").format(Number(cleaned));
  }
  return s;
}

// Normalize a price to a "$"-prefixed string. Accepts "$3.93", "3.93",
// "$3,500", 16.5. Keeps existing formatting/decimals where present.
export function normalizePrice(price: string | number): string {
  if (typeof price === "number") {
    return `$${price.toLocaleString("en-US")}`;
  }
  const s = price.trim();
  if (!s) return "";
  return s.startsWith("$") ? s : `$${s}`;
}

// ---- Title auto-derivation (fallback) ------------------------------------

// When no concise title is supplied, derive one from a price-list description:
// strip brand marks, cap at ~6 words.
export function deriveTitle(description: string): string {
  const stripped = description.replace(/[®™©]/g, "").trim().replace(/\s+/g, " ");
  const words = stripped.split(" ");
  return words.slice(0, 6).join(" ");
}

// ---- Lead-time phrase parsing --------------------------------------------

// "in stock or 6-8 weeks" (case-insensitive) -> stacked with leadAlt "6-8 weeks".
// Returns the structured lead fields a normalizer can apply directly.
export function parseLeadPhrase(input: string): {
  leadStacked: boolean;
  leadStock: string;
  leadAlt: string;
  leadTime: string;
} {
  const s = input.trim();
  const m = s.match(/^in\s+stock\s+or\s+(.+)$/i);
  if (m) {
    return {
      leadStacked: true,
      leadStock: "In Stock",
      leadAlt: m[1].trim(),
      leadTime: "",
    };
  }
  return { leadStacked: false, leadStock: "In Stock", leadAlt: "", leadTime: s };
}
