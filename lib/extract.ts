import { extractPdfText } from "@/lib/documents";

// Unified attachment text extraction for the brain. Every kind of document that
// arrives by email (PDF, Word, Excel, CSV, plain text) is reduced to searchable
// text so replies and suggestions can draw on it. All extractors are best-effort
// and never throw: an odd file just yields no text and is still stored/listed.
// Dynamic imports keep the heavy parsers out of the hot path / edge bundle.

const MAX_TEXT = 200_000;

function clip(s: string): string {
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
}

function ext(name: string | null): string {
  const m = (name ?? "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export type ExtractKind = "pdf" | "word" | "excel" | "csv" | "text" | "none";

// Classify by content type first, then filename extension.
export function extractKind(contentType: string | null, name: string | null): ExtractKind {
  const ct = (contentType ?? "").toLowerCase();
  const e = ext(name);
  if (ct === "application/pdf" || e === "pdf") return "pdf";
  if (
    ct.includes("wordprocessingml") ||
    ct === "application/msword" ||
    e === "docx" ||
    e === "doc"
  )
    return "word";
  if (
    ct.includes("spreadsheetml") ||
    ct === "application/vnd.ms-excel" ||
    e === "xlsx" ||
    e === "xls"
  )
    return "excel";
  if (ct === "text/csv" || e === "csv") return "csv";
  if (ct.startsWith("text/") || e === "txt" || e === "md") return "text";
  return "none";
}

async function extractWord(bytes: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return value ?? "";
  } catch {
    return "";
  }
}

async function extractExcel(bytes: Uint8Array): Promise<string> {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(bytes, { type: "array" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv.trim()) parts.push(`# ${name}\n${csv}`);
    }
    return parts.join("\n\n");
  } catch {
    return "";
  }
}

// Extract readable text from an attachment's bytes. Returns "" when the type is
// unsupported (e.g. images) or extraction fails.
export async function extractAttachmentText(
  bytes: Uint8Array,
  contentType: string | null,
  name: string | null,
): Promise<string> {
  const kind = extractKind(contentType, name);
  try {
    switch (kind) {
      case "pdf":
        return clip(await extractPdfText(bytes));
      case "word":
        return clip(await extractWord(Buffer.from(bytes)));
      case "excel":
        return clip(await extractExcel(bytes));
      case "csv":
      case "text":
        return clip(Buffer.from(bytes).toString("utf8"));
      default:
        return "";
    }
  } catch {
    return "";
  }
}
