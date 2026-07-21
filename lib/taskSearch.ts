import { getOpenTasks } from "@/lib/vault";
import { listAccounts } from "@/lib/accounts";
import { toTaskView, buildAccountLookup } from "@/lib/taskView";

// Search open tasks by title/account text for the manual task-link picker
// (dev-feedback #15, TaskLinkPicker). Deliberately its own small module
// rather than exporting a search helper from lib/taskEmailLinks.ts, which
// dev-feedback #14's concurrent rebuild is actively editing.

export interface TaskSearchResult {
  id: string; // TaskView id: sourceFile:sourceLine
  title: string;
  customer: string | null;
  workstream: string | null;
  due: string | null;
}

function cleanTitle(s: string): string {
  return s.replace(/\[[A-Za-z][\w-]*::[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

export async function searchOpenTasks(query: string, limit = 20): Promise<TaskSearchResult[]> {
  const [tasks, accounts] = await Promise.all([
    getOpenTasks().catch(() => []),
    listAccounts().catch(() => []),
  ]);
  const lookup = buildAccountLookup(accounts);
  const views = tasks
    .map((t) => toTaskView(t, lookup))
    .filter((t) => t.workstream !== "nextech");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? views.filter(
        (t) =>
          cleanTitle(t.title).toLowerCase().includes(q) ||
          (t.customer ?? "").toLowerCase().includes(q),
      )
    : views;

  return filtered.slice(0, limit).map((t) => ({
    id: t.id,
    title: cleanTitle(t.title),
    customer: t.customer ?? null,
    workstream: t.workstream ?? null,
    due: t.due ?? null,
  }));
}
