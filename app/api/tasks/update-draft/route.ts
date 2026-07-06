import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured, draftCustomerUpdate, AiNotConfiguredError } from "@/lib/ai";
import { getVoiceProfile, voiceInstructions } from "@/lib/voice";
import { todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Draft a proactive customer status update for an open task. Tone adapts to the
// due date and whether it's blocked internally (see draftCustomerUpdate).
export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI drafting unavailable (ANTHROPIC_API_KEY unset)." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const taskTitle = typeof body?.taskTitle === "string" ? body.taskTitle.trim() : "";
  const account = typeof body?.account === "string" ? body.account.trim() : "";
  if (!taskTitle || !account) {
    return NextResponse.json({ error: "taskTitle and account are required." }, { status: 400 });
  }

  try {
    const voice = voiceInstructions(await getVoiceProfile());
    const draft = await draftCustomerUpdate({
      taskTitle,
      account,
      contactName: typeof body?.contactName === "string" ? body.contactName : null,
      due: typeof body?.due === "string" ? body.due : null,
      today: todayISO(),
      blockedInternally: body?.blockedInternally === true,
      voice,
    });
    return NextResponse.json({ ok: true, body: draft });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Drafting failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
