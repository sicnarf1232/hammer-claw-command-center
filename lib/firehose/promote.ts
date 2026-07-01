import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, documents } from "@/lib/db/schema";
import type { DocType } from "@/lib/documents";

// Promote a real document attachment into the shared Document Library so a file
// that arrives by email becomes first-class, reusable brain knowledge (usable in
// /ask, quotes, the account's Documents tab, and reply suggestions). Best-effort:
// a failure here never affects storing the email itself. Only meaningful docs are
// promoted (real files over a size floor); images and tiny bits are skipped by
// the caller.

// Smallest attachment worth keeping in the library (bytes). Below this it is
// almost always a stub, an icon, or a one-line note, not reference material.
export const LIBRARY_MIN_BYTES = 8 * 1024;

// Guess the library docType from the filename so promoted files land in the
// right bucket (cert, iso, pcn, drawing, spec, biocomp, quote, else other).
export function guessDocType(name: string | null): DocType {
  const n = (name ?? "").toLowerCase();
  if (/\b(iso|13485|9001|14971)\b/.test(n)) return "iso";
  if (/(biocomp|iso[-_ ]?10993|cytotox|sensitiz)/.test(n)) return "biocomp";
  if (/\b(pcn|change[-_ ]?notif|eol|end[-_ ]?of[-_ ]?life)\b/.test(n)) return "pcn";
  if (/(drawing|\.dwg|\.dxf|blueprint|\brev[-_ ]?[a-z0-9]\b)/.test(n)) return "drawing";
  if (/(spec|specification|datasheet|data[-_ ]?sheet)/.test(n)) return "spec";
  if (/(cert|certificate|conformance|\bcoc\b|\bcofa\b|c[-_ ]?of[-_ ]?[ac])/.test(n)) return "cert";
  if (/(quote|quotation|rfq|pricing)/.test(n)) return "quote";
  return "other";
}

async function accountName(accountId: number | null): Promise<string | null> {
  if (accountId == null) return null;
  try {
    const [row] = await getDb()
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    return row?.name ?? null;
  } catch {
    return null;
  }
}

export interface PromoteInput {
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  blobUrl: string; // reuses the private blob the attachment was already stored to
  extractedText: string | null;
  accountId: number | null;
  isImage: boolean;
}

// Add a document to the library if it is meaningful and not already present.
// Returns the new document id, or null when skipped/deduped.
export async function promoteAttachmentToLibrary(
  input: PromoteInput,
): Promise<number | null> {
  if (input.isImage) return null;
  if (!input.blobUrl) return null; // no retained file to reference
  if ((input.sizeBytes ?? 0) < LIBRARY_MIN_BYTES) return null;
  const fileName = input.fileName?.trim();
  if (!fileName) return null;

  const db = getDb();
  const account = await accountName(input.accountId);

  // Dedupe: same filename (case-insensitive) under the same account is treated as
  // the same document, so a spec re-sent on three threads is stored once.
  try {
    const existing = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          sql`lower(${documents.fileName}) = ${fileName.toLowerCase()}`,
          account
            ? sql`lower(coalesce(${documents.account},'')) = ${account.toLowerCase()}`
            : sql`${documents.account} is null`,
        ),
      )
      .limit(1);
    if (existing.length) return null;
  } catch {
    return null; // documents table absent: nothing to promote into
  }

  try {
    const [row] = await db
      .insert(documents)
      .values({
        title: fileName,
        fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        blobUrl: input.blobUrl,
        docType: guessDocType(fileName),
        account,
        tags: ["email"],
        extractedText: input.extractedText,
        notes: "Captured from email.",
      })
      .returning({ id: documents.id });
    return row?.id ?? null;
  } catch {
    return null;
  }
}
