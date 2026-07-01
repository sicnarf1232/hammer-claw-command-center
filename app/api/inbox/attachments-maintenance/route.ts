import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails, emailAttachments } from "@/lib/db/schema";
import { ensureFirehoseSchema } from "@/lib/firehose/schema";
import { isInlineAttachment } from "@/lib/firehose/attach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-time backfill: mark existing inline images (signature logos) as inline and
// recompute emails.hasAttachments off the real (non-inline) attachments, so mail
// stored before the inline fix stops showing phantom attachments.
export async function POST() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  await ensureFirehoseSchema();
  const db = getDb();

  const atts = await db.select().from(emailAttachments);
  let markedInline = 0;
  const realByEmail = new Map<number, boolean>();

  for (const a of atts) {
    const inline = a.isInline || isInlineAttachment(a.fileName, a.contentType, a.sizeBytes);
    if (inline && !a.isInline) {
      await db.update(emailAttachments).set({ isInline: true }).where(eq(emailAttachments.id, a.id));
      markedInline++;
    }
    if (!inline) realByEmail.set(a.emailId, true);
  }

  // Recompute hasAttachments for every email that has attachment rows.
  const emailIds = Array.from(new Set(atts.map((a) => a.emailId)));
  let updated = 0;
  for (const batch of chunk(emailIds, 50)) {
    for (const id of batch) {
      await db
        .update(emails)
        .set({ hasAttachments: realByEmail.get(id) === true })
        .where(eq(emails.id, id));
      updated++;
    }
  }

  return NextResponse.json({ ok: true, attachments: atts.length, markedInline, emailsUpdated: updated });
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
