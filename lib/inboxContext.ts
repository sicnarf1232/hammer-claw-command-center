import { getAllTasks } from "@/lib/vault";
import { taskIdsByLinkedThread } from "@/lib/taskMeta";
import { todayISO } from "@/lib/dates";

// The inbox "why this matters" context (2026-07-07 overhaul): for each thread,
// the most urgent OPEN task linked to it. A needs-reply email matters because
// of what it is attached to; this is that attachment.

export interface LinkedTaskContext {
  taskId: string;
  title: string;
  due: string | null;
  overdue: boolean;
}

export async function linkedTaskContextForThreads(
  threadKeys: string[],
): Promise<Map<string, LinkedTaskContext>> {
  const out = new Map<string, LinkedTaskContext>();
  const byThread = await taskIdsByLinkedThread(threadKeys).catch(
    () => new Map<string, string[]>(),
  );
  if (byThread.size === 0) return out;

  const today = todayISO();
  const tasks = await getAllTasks().catch(() => []);
  const taskById = new Map(
    tasks.map((t) => [`${t.sourceFile}:${t.sourceLine}`, t]),
  );

  for (const [key, ids] of byThread) {
    const open = ids
      .map((id) => ({ id, task: taskById.get(id) }))
      .filter((x) => x.task && !x.task.done);
    if (!open.length) continue;
    // Most urgent first: overdue, then earliest due, then undated.
    open.sort((a, b) => (a.task!.due ?? "9999") .localeCompare(b.task!.due ?? "9999"));
    const pick = open[0];
    const due = pick.task!.due ?? null;
    out.set(key, {
      taskId: pick.id,
      title: pick.task!.title.replace(/\[[A-Za-z][\w-]*::[^\]]*\]/g, "").trim(),
      due,
      overdue: Boolean(due && due < today),
    });
  }
  return out;
}
