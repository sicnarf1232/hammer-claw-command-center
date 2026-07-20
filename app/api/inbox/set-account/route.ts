import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails } from "@/lib/db/schema";
import { ensureFirehoseSchema } from "@/lib/firehose/schema";
import { listDbAccounts } from "@/lib/firehose/senderSuggest";
import { validateSetAccountRequest, SetAccountError } from "@/lib/inboxSetAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual thread<->account override (dev-feedback #13): an all-internal
// thread (every participant is a Merit colleague) never trips the
// senderSuggestion flow (that only fires for an unmapped EXTERNAL sender),
// but can still be substantively about a customer. This sets (or clears) the
// account on every message in the thread and marks accountManual so the
// automatic mappers (domain link, sender backfill) never overwrite it.
// Body: { key: "t:<threadId>" | "m:<emailId>", accountId: number | null }.
// accountId: null explicitly unlinks (clears accountId and accountManual).
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const accounts = await listDbAccounts();

  let validated;
  try {
    validated = validateSetAccountRequest(
      { key: body?.key, accountId: body?.accountId },
      accounts.map((a) => a.id),
    );
  } catch (err) {
    if (err instanceof SetAccountError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  await ensureFirehoseSchema();
  const db = getDb();
  const where =
    validated.parsed.kind === "t"
      ? eq(emails.threadId, validated.parsed.value)
      : eq(emails.id, Number(validated.parsed.value));

  const set =
    validated.accountId == null
      ? { accountId: null, accountManual: false }
      : { accountId: validated.accountId, accountManual: true, needsReview: false };

  try {
    const updated = await db.update(emails).set(set).where(where).returning({ id: emails.id });
    if (!updated.length) {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, updated: updated.length });
  } catch (err) {
    console.error("[inbox/set-account] failed:", err);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
