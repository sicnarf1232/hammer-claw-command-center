import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { listThreadsSince } from "@/lib/firehose/read";
import { getTriageMap } from "@/lib/firehose/triage";
import { buildInboxRows, reconcileReviewedTriage } from "@/lib/inboxRows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live inbox delta: thread rows with activity newer than ?since=<ISO>, shaped
// exactly like the page render so the client can merge them keyed by thread.
// Same narrow scan discipline as listThreads (no bodies). `now` is captured
// BEFORE the scan so the next cursor can never skip a message that lands
// mid-query; never errors to the client (a bad tick just returns empty).
export async function GET(req: NextRequest) {
  const now = new Date().toISOString();
  const since = req.nextUrl.searchParams.get("since");
  if (!since || Number.isNaN(Date.parse(since)) || !dbConfigured()) {
    return NextResponse.json({ ok: true, now, threads: [] });
  }
  try {
    const summaries = await listThreadsSince(since);
    if (summaries.length === 0) {
      return NextResponse.json({ ok: true, now, threads: [] });
    }
    const triage = await getTriageMap(summaries.map((t) => t.key));
    reconcileReviewedTriage(summaries, triage);
    const threads = await buildInboxRows(summaries, triage);
    return NextResponse.json({ ok: true, now, threads });
  } catch {
    return NextResponse.json({ ok: true, now, threads: [] });
  }
}
