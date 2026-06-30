import { put, del, get } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";
import { getDb, dbConfigured, documents } from "@/lib/db";

// Document library (Milestone 3 #1): reference material (ISO docs, biocomp,
// drawings, certs, PCNs, specs) is stored in Vercel Blob; Postgres holds the
// searchable index (this is the start of the app being its own source of truth).
// Everything degrades cleanly when Blob/DB are not configured.

export const DOC_TYPES = [
  { key: "quote", label: "Quote" },
  { key: "iso", label: "ISO doc" },
  { key: "biocomp", label: "Biocompatibility" },
  { key: "drawing", label: "Drawing" },
  { key: "cert", label: "Certificate" },
  { key: "pcn", label: "OEM PCN" },
  { key: "spec", label: "Spec sheet" },
  { key: "other", label: "Other" },
] as const;

export type DocType = (typeof DOC_TYPES)[number]["key"];

export function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && DOC_TYPES.some((d) => d.key === v);
}

export function docTypeLabel(key: string): string {
  return DOC_TYPES.find((d) => d.key === key)?.label ?? "Other";
}

export interface DocumentRecord {
  id: number;
  title: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  blobUrl: string;
  docType: string;
  account: string | null;
  tags: string[] | null;
  extractedText: string | null;
  notes: string | null;
  spec?: unknown; // for quotes: the QuoteSpec, so it can be re-opened to edit
  uploadedAt: Date;
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// The library needs both a place for files (Blob) and the index (Postgres).
export function documentsEnabled(): boolean {
  return dbConfigured() && blobConfigured();
}

// Best-effort PDF text extraction for retrieval. Never throws: a scanned or
// odd PDF just yields no text, and the file is still stored and listed.
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : text;
    return joined.replace(/\s+\n/g, "\n").trim().slice(0, 200_000);
  } catch {
    return "";
  }
}

export interface UploadInput {
  bytes: Uint8Array;
  fileName: string;
  contentType?: string;
  title?: string;
  docType: DocType;
  account?: string;
  notes?: string;
  spec?: unknown; // for quotes
}

export async function uploadDocument(input: UploadInput): Promise<DocumentRecord> {
  if (!documentsEnabled()) {
    throw new Error("Document library is not configured (needs POSTGRES_URL and BLOB_READ_WRITE_TOKEN).");
  }
  const safe = input.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  const key = `documents/${Date.now()}-${safe}`;
  // Private access: these are confidential customer documents (quotes, specs).
  // They are served back through the authed proxy route /api/documents/file.
  const blob = await put(key, Buffer.from(input.bytes), {
    access: "private",
    contentType: input.contentType,
    addRandomSuffix: true,
  });

  const isPdf =
    input.contentType === "application/pdf" || /\.pdf$/i.test(input.fileName);
  const extractedText = isPdf ? await extractPdfText(input.bytes) : "";

  const values = {
    title: input.title?.trim() || input.fileName,
    fileName: input.fileName,
    contentType: input.contentType ?? null,
    sizeBytes: input.bytes.byteLength,
    blobUrl: blob.url,
    docType: input.docType,
    account: input.account?.trim() || null,
    tags: [],
    extractedText: extractedText || null,
    notes: input.notes?.trim() || null,
    spec: input.spec ?? null,
  };
  try {
    const [row] = await getDb().insert(documents).values(values).returning();
    return row as DocumentRecord;
  } catch (err) {
    // Tolerate a pre-migration DB without the `spec` column: retry without it.
    if (/column .*spec.* does not exist/i.test(String(err))) {
      const { spec: _spec, ...rest } = values;
      void _spec;
      const [row] = await getDb().insert(documents).values(rest).returning();
      return row as DocumentRecord;
    }
    throw err;
  }
}

// Columns without `spec`, used as a fallback on a pre-migration DB so reads
// never break before ALTER TABLE ... ADD COLUMN spec has been run.
const COLS_NO_SPEC = {
  id: documents.id,
  title: documents.title,
  fileName: documents.fileName,
  contentType: documents.contentType,
  sizeBytes: documents.sizeBytes,
  blobUrl: documents.blobUrl,
  docType: documents.docType,
  account: documents.account,
  tags: documents.tags,
  extractedText: documents.extractedText,
  notes: documents.notes,
  uploadedAt: documents.uploadedAt,
};

// Read documents (optionally filtered), tolerating a DB that lacks the spec
// column: if the all-columns select fails on spec, retry without it.
async function queryDocuments(
  where?: ReturnType<typeof eq>,
): Promise<DocumentRecord[]> {
  const db = getDb();
  try {
    const q = db.select().from(documents);
    const rows = where
      ? await q.where(where).orderBy(desc(documents.uploadedAt))
      : await q.orderBy(desc(documents.uploadedAt));
    return rows as DocumentRecord[];
  } catch (err) {
    if (!/column .*spec.* does not exist/i.test(String(err))) throw err;
    const q = db.select(COLS_NO_SPEC).from(documents);
    const rows = where
      ? await q.where(where).orderBy(desc(documents.uploadedAt))
      : await q.orderBy(desc(documents.uploadedAt));
    return rows as DocumentRecord[];
  }
}

// Find an existing document by account + title + type (used to overwrite a quote
// when it is re-saved under the same quote id).
export async function findDocument(
  account: string,
  title: string,
  docType: DocType,
): Promise<DocumentRecord | null> {
  if (!dbConfigured()) return null;
  const rows = await queryDocuments(eq(documents.docType, docType));
  return (
    rows.find(
      (r) =>
        (r.account ?? "").trim().toLowerCase() === account.trim().toLowerCase() &&
        r.title.trim().toLowerCase() === title.trim().toLowerCase(),
    ) ?? null
  );
}

export async function listDocuments(account?: string): Promise<DocumentRecord[]> {
  if (!dbConfigured()) return [];
  return queryDocuments(account ? eq(documents.account, account) : undefined);
}

export async function getDocument(id: number): Promise<DocumentRecord | null> {
  if (!dbConfigured()) return null;
  const rows = await queryDocuments(eq(documents.id, id));
  return rows[0] ?? null;
}

// Open a private blob's byte stream (server-side, token-authed) so the proxy
// route can stream it back to the authed user.
export async function openDocumentBlob(blobUrl: string) {
  return get(blobUrl, { access: "private" });
}

export async function deleteDocument(id: number): Promise<void> {
  if (!dbConfigured()) return;
  const db = getDb();
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  if (!row) return;
  if (blobConfigured()) {
    await del((row as DocumentRecord).blobUrl).catch(() => {});
  }
  await db.delete(documents).where(eq(documents.id, id));
}

// Pure: rank documents by question-keyword overlap across title, account, type,
// tags, and extracted text. Returns the top matches with at least one hit.
export function matchDocuments(
  question: string,
  docs: DocumentRecord[],
  limit: number,
): DocumentRecord[] {
  const words = Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    ),
  );
  if (!words.length) return [];
  const scored = docs.map((d) => {
    const hay = `${d.title} ${d.account ?? ""} ${d.docType} ${(d.tags ?? []).join(" ")} ${d.extractedText ?? ""}`.toLowerCase();
    let score = 0;
    for (const w of words) if (hay.includes(w)) score++;
    return { d, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.d);
}
