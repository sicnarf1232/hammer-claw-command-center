import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { dbCreateTask } from "@/lib/tasksDb";
import { emailIdsForThreadKey } from "@/lib/firehose/read";
import { setLinkedThread } from "@/lib/taskMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DB-first task creation (Phase 2): quick-add on /tasks and "Create task" in
// the thread composer. Never writes the vault; the export renders app-created
// tasks back into markdown when Jordan runs it.
// body: { title, due?, priority?, customer?, workstream?, description?, threadKey? }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "A task title is required." }, { status: 400 });
  }
  const due = typeof body?.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due)
    ? body.due
    : undefined;
  const threadKey = typeof body?.threadKey === "string" ? body.threadKey : null;

  try {
    const emailIds = threadKey ? await emailIdsForThreadKey(threadKey) : [];
    const created = await dbCreateTask({
      title,
      due,
      priority: typeof body?.priority === "string" ? body.priority : undefined,
      customer: typeof body?.customer === "string" ? body.customer : undefined,
      workstream: typeof body?.workstream === "string" ? body.workstream : undefined,
      description: typeof body?.description === "string" ? body.description : undefined,
      emailIds,
    });
    if (threadKey) {
      await setLinkedThread(created.taskId, threadKey).catch(() => {});
    }
    return NextResponse.json({ ok: true, ...created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
