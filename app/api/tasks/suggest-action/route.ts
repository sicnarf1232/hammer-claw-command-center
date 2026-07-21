import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { aiConfigured, suggestTaskAction } from "@/lib/ai";
import { matchedTaskTypeKeyword, TASK_TYPES, type TaskType } from "@/lib/taskType";
import { cleanTaskTitle } from "@/lib/taskView";
import { gatherTaskActionContext, type TaskActionContext } from "@/lib/taskActionContext";
import { searchPeople } from "@/lib/peopleSearch";
import { pickBestPersonMatch } from "@/lib/recipientMatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_ACTION_CONTEXT: TaskActionContext = {
  meetingContext: "",
  emailContext: "",
  linkedMeetingNote: null,
};

// dev-feedback #21: what should Jordan actually do next on this task, shared
// by TaskDetail (TasksTable.tsx) and TaskCard (TasksGrouped.tsx) via
// components/TaskSuggestedAction.tsx, so both views always agree.
//
// Without ANTHROPIC_API_KEY this falls back to the exact old deterministic
// rule (task type is Pricing/Quote -> create-quote, else none), so the
// feature degrades to prior behavior rather than disappearing when AI is not
// configured (lib/ai.ts's standing rule for optional AI features).
// body: { sourceFile, sourceLine, title, description, type }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sourceFile = typeof body?.sourceFile === "string" ? body.sourceFile : "";
  const sourceLine = Number(body?.sourceLine);
  const rawTitle = typeof body?.title === "string" ? body.title : "";
  const description = typeof body?.description === "string" ? body.description : "";
  const type: TaskType = (TASK_TYPES as readonly string[]).includes(body?.type)
    ? (body.type as TaskType)
    : "Admin/Other";
  if (!sourceFile || !Number.isInteger(sourceLine) || sourceLine < 0 || !rawTitle.trim()) {
    return NextResponse.json(
      { error: "sourceFile, sourceLine, and title are required." },
      { status: 400 },
    );
  }
  const title = cleanTaskTitle(rawTitle);

  if (!aiConfigured()) {
    const keyword = type === "Pricing/Quote" ? matchedTaskTypeKeyword(rawTitle, description, type) : null;
    return NextResponse.json({
      ok: true,
      action: type === "Pricing/Quote" ? "create-quote" : "none",
      recipientName: null,
      recipientEmail: null,
      reason: keyword
        ? `Suggested because this task mentions "${keyword.toLowerCase()}".`
        : "Suggested because this task is typed as Pricing/Quote.",
      linkedMeetingNote: null,
    });
  }

  try {
    const context = dbConfigured()
      ? await gatherTaskActionContext(sourceFile, sourceLine).catch(() => EMPTY_ACTION_CONTEXT)
      : EMPTY_ACTION_CONTEXT;

    const suggestion = await suggestTaskAction({
      title,
      description,
      linkedMeetingContext: context.meetingContext,
      linkedEmailContext: context.emailContext,
    });

    let recipientEmail: string | null = null;
    if (suggestion.action === "draft-email" && suggestion.recipientName && dbConfigured()) {
      const candidates = await searchPeople(suggestion.recipientName).catch(() => []);
      recipientEmail = pickBestPersonMatch(suggestion.recipientName, candidates)?.email ?? null;
    }

    return NextResponse.json({
      ok: true,
      action: suggestion.action,
      recipientName: suggestion.recipientName,
      recipientEmail,
      reason: suggestion.reason,
      linkedMeetingNote: context.linkedMeetingNote,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not compute a suggestion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
