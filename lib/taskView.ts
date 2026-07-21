import type { Task, Priority, Account } from "@/lib/vault/types";
import { classifyTaskType, TASK_TYPES, type TaskType } from "@/lib/taskType";

// A serializable, client-safe projection of a Task with its account resolved.
export interface TaskView {
  id: string; // stable key: sourceFile:sourceLine
  title: string;
  done: boolean;
  due?: string;
  start?: string; // scheduled ?? created (when work starts / was assigned)
  priority?: Priority;
  taskStatus?: string; // waiting | blocked | someday
  workstream?: string; // derived from the file path, then the task field
  type: TaskType; // derived OEM request type
  customer?: string; // display name
  accountSlug?: string; // resolved account, when the customer matches one
  description?: string;
  notes?: string;
  thread?: string;
  // Who this task is delegated to (dev-feedback #20), carried straight
  // through from Task.delegate. See lib/vault/types.ts for the rationale.
  delegatedTo?: { personId: number; name: string; email?: string | null };
  sourceFile: string;
  sourceLine: number;
}

// Strip the inline vault field markers ([customer:: ...], [due:: ...], etc.)
// that can leak into a task's raw title text, for any UI that displays or
// forwards the title. Hoisted here (dev-feedback #21 parity pass) so
// TasksTable.tsx, TasksGrouped.tsx, and TaskSuggestedAction.tsx share one
// implementation instead of three near-identical copies drifting apart.
//
// Matches a [[Wikilink]] or [[Target|Alias]] value FIRST (its own two-char
// close), falling back to a plain (non-bracket) value. The single-pattern
// version this replaced (`[^\]]*\]`) stopped at the first `]` inside a
// wikilink value, e.g. `[customer:: [[Trelleborg]]]` (the vault contract's
// own real-example format for the customer field), and left a stray `]]`
// behind; caught by lib/taskView.test.ts.
const FIELD_MARKER_RE = /\[[A-Za-z][\w-]*::\s*\[\[[^\]]*\]\]\s*\]|\[[A-Za-z][\w-]*::[^\]]*\]/g;

export function cleanTaskTitle(s: string): string {
  return s.replace(FIELD_MARKER_RE, "").replace(/\s+/g, " ").trim();
}

// Build the /quote handoff URL from a task (dev-feedback #11 Part B),
// carrying the task's own text over as the quote builder's free-form parse
// input. Shared by TaskDetail (TasksTable.tsx) and TaskCard (TasksGrouped.tsx)
// via components/TaskSuggestedAction.tsx, so both views build the same link.
export function quoteHrefForTask(
  t: Pick<TaskView, "customer" | "title" | "description" | "notes">,
): string {
  const params = new URLSearchParams();
  if (t.customer && t.customer !== "internal") params.set("customer", t.customer);
  params.set("desc", cleanTaskTitle(t.title));
  const parseText = [cleanTaskTitle(t.title), t.description, t.notes].filter(Boolean).join("\n");
  if (parseText) params.set("parse", parseText);
  return `/quote?${params.toString()}`;
}

// Derive the workstream from the vault folder the task lives in (reliable even
// when the note has no workstream field), falling back to the task's own value.
export function workstreamFromPath(
  path: string,
  fallback?: string,
): string | undefined {
  if (path.startsWith("300 Merit/")) return "merit";
  if (path.startsWith("400 Nextech/")) return "nextech";
  if (path.startsWith("500 Sloan/")) return "sloan";
  if (path.startsWith("600 Personal/")) return "personal";
  return fallback;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
}

// Map normalized customer name -> { slug, name } for fast task->account linking.
export function buildAccountLookup(
  accounts: Pick<Account, "name" | "slug" | "path">[],
): Map<string, { slug: string; name: string }> {
  const map = new Map<string, { slug: string; name: string }>();
  for (const a of accounts) {
    const base = a.path.split("/").pop()!.replace(/\.md$/, "");
    for (const key of [norm(a.name), norm(base)]) {
      if (key) map.set(key, { slug: a.slug, name: a.name });
    }
  }
  return map;
}

// The task type is normally derived from the title/description (no such field
// in the vault contract), but the /tasks inline editor lets Jordan override it
// per task. The override rides in the existing `fields` jsonb bag under the
// "type" key so no schema change is needed; it wins over the derived guess.
function resolveTaskType(t: Task): TaskType {
  const override = t.fields?.type;
  if (override && (TASK_TYPES as readonly string[]).includes(override)) {
    return override as TaskType;
  }
  return classifyTaskType(t.title, t.description);
}

export function toTaskView(
  t: Task,
  lookup?: Map<string, { slug: string; name: string }>,
): TaskView {
  const customerName =
    t.customer && t.customer !== "internal" ? t.customer.basename : undefined;
  const account = customerName ? lookup?.get(norm(customerName)) : undefined;
  return {
    id: `${t.sourceFile}:${t.sourceLine}`,
    title: t.title,
    done: t.done,
    due: t.due,
    start: t.scheduled ?? t.created,
    priority: t.priority,
    taskStatus: t.taskStatus,
    workstream: workstreamFromPath(
      t.sourceFile,
      typeof t.workstream === "string" ? t.workstream : undefined,
    ),
    type: resolveTaskType(t),
    customer: t.customer === "internal" ? "internal" : account?.name ?? customerName,
    accountSlug: account?.slug,
    description: t.description || undefined,
    notes: t.notes || undefined,
    thread: t.thread,
    delegatedTo: t.delegate,
    sourceFile: t.sourceFile,
    sourceLine: t.sourceLine,
  };
}
