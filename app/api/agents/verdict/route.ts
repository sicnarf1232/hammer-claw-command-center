import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { setManualTriage } from "@/lib/firehose/triage";
import { addAgentFeedback } from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATHWAYS = ["needs-reply", "quote-request", "quality-pcn", "logistics", "fyi", "noise"];

// Grading a Triage call from the /agents review queue. Approve latches the
// AI's pathway as Jordan-confirmed (same value, manual=true, so it counts as
// agreement); edit latches the corrected pathway (counts as a miss). Both go
// through setManualTriage, which freezes the AI's original into ai_snapshot
// on first touch: the grade IS the training record.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const key = String(body?.key ?? "");
  const pathway = String(body?.pathway ?? "");
  if (!key || !PATHWAYS.includes(pathway)) {
    return NextResponse.json({ error: "key and a valid pathway are required." }, { status: 400 });
  }
  const proposed = typeof body?.proposed === "string" ? body.proposed : null;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
  try {
    await setManualTriage(key, { pathway });
    // The verdict, with Jordan's optional justification: the contextual
    // training record that shapes the agent beyond raw agree/disagree.
    await addAgentFeedback({
      agent: "triage",
      itemKey: key,
      verdict: proposed && proposed !== pathway ? "edited" : "approved",
      proposed,
      corrected: pathway,
      note,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verdict failed." },
      { status: 500 },
    );
  }
}
