import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { linkTasksToEmail } from "@/lib/emailTaskLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// General, manual "link this email to task(s)" (dev-feedback #15): distinct
// from the AI-suggestion confirm flow (app/api/tasks/link-email/route.ts),
// this is Jordan deliberately picking any number of tasks for ONE existing
// email (components/TaskLinkPicker.tsx, invoked from ThreadDetail). For a
// brand-new outbound email that has no id yet, see /api/emails/pending-link
// instead.
// body: { emailId: number, taskIds: string[] }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const emailId = Number((body as Record<string, unknown> | null)?.emailId);
  const taskIds = Array.isArray((body as Record<string, unknown> | null)?.taskIds)
    ? ((body as Record<string, unknown>).taskIds as unknown[]).map((x) => String(x))
    : [];
  if (!Number.isInteger(emailId)) {
    return NextResponse.json({ error: "emailId is required." }, { status: 400 });
  }
  if (!taskIds.length) {
    return NextResponse.json({ error: "At least one taskId is required." }, { status: 400 });
  }

  try {
    const result = await linkTasksToEmail(taskIds, emailId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Link failed." },
      { status: 500 },
    );
  }
}
