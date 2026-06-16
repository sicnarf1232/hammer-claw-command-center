import type { Task, Priority, Account } from "@/lib/vault/types";

// A serializable, client-safe projection of a Task with its account resolved.
export interface TaskView {
  id: string; // stable key: sourceFile:sourceLine
  title: string;
  done: boolean;
  due?: string;
  priority?: Priority;
  taskStatus?: string; // waiting | blocked | someday
  workstream?: string;
  customer?: string; // display name
  accountSlug?: string; // resolved account, when the customer matches one
  description?: string;
  notes?: string;
  thread?: string;
  sourceFile: string;
  sourceLine: number;
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
    priority: t.priority,
    taskStatus: t.taskStatus,
    workstream: typeof t.workstream === "string" ? t.workstream : undefined,
    customer: t.customer === "internal" ? "internal" : account?.name ?? customerName,
    accountSlug: account?.slug,
    description: t.description || undefined,
    notes: t.notes || undefined,
    thread: t.thread,
    sourceFile: t.sourceFile,
    sourceLine: t.sourceLine,
  };
}
