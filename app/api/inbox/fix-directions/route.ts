import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails } from "@/lib/db/schema";
import { SELF_ADDRESSES } from "@/lib/firehose/map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time fix: mail sent BY Jordan was captured as "inbound" (the Sent flow did
// not tag direction). Relabel every message from one of his own addresses as
// outbound so threads show his side and reply-state is correct.
export async function POST() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const lowered = SELF_ADDRESSES.map((a) => a.toLowerCase());
  const res = await getDb()
    .update(emails)
    .set({ direction: "outbound" })
    .where(sql`lower(${emails.fromEmail}) = any(${lowered}) and ${emails.direction} <> 'outbound'`)
    .returning({ id: emails.id });
  return NextResponse.json({ ok: true, relabeled: res.length, ids: res.map((r) => r.id) });
}
