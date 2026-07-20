import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { ensureFirehoseSchema } from "@/lib/firehose/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backfill account/person mapping onto emails stored before the people/accounts
// tables existed. Exact email match only (safe/certain): a message whose sender
// matches a known contact inherits that contact's account. Unknown external
// senders stay unmapped and surface the per-thread link picker instead.
export async function POST() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  await ensureFirehoseSchema();
  const db = getDb();

  // Map by sender email -> person (and their account). Never overwrite a
  // thread Jordan manually linked to an account (dev-feedback #13).
  const bySender = await db.execute(sql`
    update emails e
       set account_id = p.account_id,
           person_id  = p.id
      from people p
     where lower(e.from_email) = lower(p.email)
       and p.email is not null
       and (e.account_id is null or e.person_id is null)
       and (e.account_manual is not true)
    returning e.id
  `);

  // Clear needs_review on any email that is now mapped to an account.
  await db.execute(sql`
    update emails set needs_review = false
     where account_id is not null and needs_review = true
  `);

  const rows = Array.isArray(bySender)
    ? bySender
    : ((bySender as { rows?: unknown[] }).rows ?? []);
  return NextResponse.json({ ok: true, remapped: rows.length });
}
