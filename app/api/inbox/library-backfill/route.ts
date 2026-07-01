import { NextResponse } from "next/server";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails, emailAttachments } from "@/lib/db/schema";
import { ensureFirehoseSchema } from "@/lib/firehose/schema";
import { openAttachmentBlob } from "@/lib/firehose/read";
import { extractAttachmentText, extractKind } from "@/lib/extract";
import { promoteAttachmentToLibrary } from "@/lib/firehose/promote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One-time backfill: over attachments already stored (before the attachment
// brain shipped), re-extract text for Word/Excel/CSV/text (PDFs were done at
// ingest), then promote the meaningful docs into the Document Library. Bounded
// per call; re-run until `scanned` stops advancing. Best-effort per file.
export async function POST() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  await ensureFirehoseSchema();
  const db = getDb();

  // Real, retained, non-image attachments.
  const atts = await db
    .select()
    .from(emailAttachments)
    .where(and(eq(emailAttachments.isImage, false), isNotNull(emailAttachments.blobUrl)))
    .limit(200);

  // Map each attachment's email to its account for library tagging.
  const emailIds = Array.from(new Set(atts.map((a) => a.emailId)));
  const acctByEmail = new Map<number, number | null>();
  for (const batch of chunk(emailIds, 100)) {
    const rows = await db
      .select({ id: emails.id, accountId: emails.accountId })
      .from(emails)
      .where(inArray(emails.id, batch));
    for (const r of rows) acctByEmail.set(r.id, r.accountId ?? null);
  }

  let extracted = 0;
  let promoted = 0;
  let scanned = 0;

  for (const a of atts) {
    scanned++;
    if (a.isInline) continue;
    const kind = extractKind(a.contentType, a.fileName);
    let text = a.extractedText;

    // Fill in text for types that were never extracted (anything but PDF, or an
    // empty PDF result), by re-reading the stored blob.
    if (!text && kind !== "none" && a.blobUrl) {
      try {
        const res = await openAttachmentBlob(a.blobUrl);
        if (res && res.statusCode === 200) {
          const buf = Buffer.from(await new Response(res.stream as unknown as ReadableStream).arrayBuffer());
          text = (await extractAttachmentText(buf, a.contentType, a.fileName)) || null;
          if (text) {
            await db
              .update(emailAttachments)
              .set({ extractedText: text })
              .where(eq(emailAttachments.id, a.id));
            extracted++;
          }
        }
      } catch {
        /* skip this file */
      }
    }

    const newId = await promoteAttachmentToLibrary({
      fileName: a.fileName,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      blobUrl: a.blobUrl!,
      extractedText: text,
      accountId: acctByEmail.get(a.emailId) ?? null,
      isImage: a.isImage,
    }).catch(() => null);
    if (newId) promoted++;
  }

  return NextResponse.json({ ok: true, scanned, extracted, promoted });
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
