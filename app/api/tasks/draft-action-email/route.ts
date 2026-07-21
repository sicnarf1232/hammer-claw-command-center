import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { aiConfigured, draftReply } from "@/lib/ai";
import { cleanTaskTitle } from "@/lib/taskView";
import { getVoiceProfile, voiceInstructions } from "@/lib/voice";
import { gatherTaskActionContext, type TaskActionContext } from "@/lib/taskActionContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_ACTION_CONTEXT: TaskActionContext = {
  meetingContext: "",
  emailContext: "",
  linkedMeetingNote: null,
};

// dev-feedback #21: the actual body for a "Draft email to X" suggested
// action (components/TaskSuggestedAction.tsx). A separate, heavier call from
// /api/tasks/suggest-action, so a full draft is only generated when Jordan
// actually clicks, not on every task expand. Reuses draftReply's existing
// "new email" path, the same one Composer's own "Draft with AI" button
// calls, rather than a new drafting function. Display-only: the caller lands
// this at /compose, where Jordan reviews and edits before Send, same as
// every other AI draft in this app.
// body: { sourceFile, sourceLine, title, description, recipientName }
export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI drafting is not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const sourceFile = typeof body?.sourceFile === "string" ? body.sourceFile : "";
  const sourceLine = Number(body?.sourceLine);
  const rawTitle = typeof body?.title === "string" ? body.title : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const recipientName = typeof body?.recipientName === "string" ? body.recipientName.trim() : "";
  if (!rawTitle.trim()) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }
  const title = cleanTaskTitle(rawTitle);

  try {
    const context =
      dbConfigured() && sourceFile && Number.isInteger(sourceLine) && sourceLine >= 0
        ? await gatherTaskActionContext(sourceFile, sourceLine).catch(() => EMPTY_ACTION_CONTEXT)
        : EMPTY_ACTION_CONTEXT;

    const groundingParts = [
      description ? `Task description: ${description}` : "",
      context.meetingContext ? `Related meeting(s):\n${context.meetingContext}` : "",
      context.emailContext ? `Related email(s):\n${context.emailContext}` : "",
    ].filter(Boolean);

    const voice = voiceInstructions(await getVoiceProfile().catch(() => null));

    const bodyHtml = await draftReply({
      kind: "new",
      workstream: "merit",
      subject: title,
      voice: voice || undefined,
      instructions: recipientName
        ? `Write a short, direct email to ${recipientName} asking for exactly what this task needs: the specific approval, confirmation, or input described below. This is Jordan asking them for something, not a status update or a marketing message. Address ${recipientName} by name in the greeting.`
        : "Write a short, direct email asking for exactly what this task needs: the specific approval, confirmation, or input described below.",
      context: groundingParts.join("\n\n") || undefined,
    });

    return NextResponse.json({ ok: true, subject: title, bodyHtml });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Draft failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
