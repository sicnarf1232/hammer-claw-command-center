import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { setManualTriage } from "@/lib/firehose/triage";
import { getThread } from "@/lib/firehose/read";
import { postMarkRead } from "@/lib/powerAutomate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PATHWAYS = ["needs-reply", "quote-request", "quality-pcn", "logistics", "fyi", "noise"];

// Cap the Outlook sync per review action: enough for any real thread, and it
// keeps one click from fanning out into dozens of flow runs.
const MAX_MARKREAD_CALLS = 15;

// Manual triage: Jordan sets the pathway / reviewed / needs-reply on a thread.
// This latches (manual=true) so AI auto-triage won't overwrite it.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const key: unknown = body?.key;
  if (typeof key !== "string" || !key) {
    return NextResponse.json({ error: "key is required." }, { status: 400 });
  }
  if (body.pathway !== undefined && !PATHWAYS.includes(body.pathway)) {
    return NextResponse.json({ error: "Unknown pathway." }, { status: 400 });
  }

  try {
    await setManualTriage(key, {
      pathway: typeof body.pathway === "string" ? body.pathway : undefined,
      needsReply: typeof body.needsReply === "boolean" ? body.needsReply : undefined,
      reviewed: typeof body.reviewed === "boolean" ? body.reviewed : undefined,
    });
    // Reviewed syncs Outlook's read state: reviewed=true marks the thread's
    // inbound messages read, un-reviewing marks them unread. Best effort:
    // the app's reviewed state never depends on the flow succeeding.
    let outlookSynced = 0;
    if (typeof body.reviewed === "boolean") {
      try {
        const { messages } = await getThread(key);
        const ids = messages
          .filter((m) => m.direction !== "outbound" && m.messageId)
          .map((m) => m.messageId as string)
          .slice(0, MAX_MARKREAD_CALLS);
        const results = await Promise.allSettled(
          ids.map((id) => postMarkRead(id, body.reviewed as boolean)),
        );
        outlookSynced = results.filter(
          (r) => r.status === "fulfilled" && r.value.ok,
        ).length;
      } catch {
        // Flow not configured or unreachable: reviewed still stands.
      }
    }
    return NextResponse.json({ ok: true, outlookSynced });
  } catch (err) {
    console.error("[inbox/triage-set] failed:", err);
    return NextResponse.json({ error: "Triage update failed." }, { status: 500 });
  }
}
