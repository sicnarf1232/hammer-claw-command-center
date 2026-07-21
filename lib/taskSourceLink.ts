// Resolve the vault note behind a task's sourceFile into a working, clickable
// reference (dev-feedback #21: Jordan's "it's pulling in an MD file, but I'm
// unable to open or see the MD file" complaint). Root cause, confirmed by
// reading TaskDetail in components/TasksTable.tsx: the task detail's bottom
// chip row rendered `t.sourceFile.split("/").pop()`, the literal vault
// filename (e.g. "2026-06-17 - GTIN Alignment.md"), as inert font-mono text
// with no href and no click handler at all. It looked like a link (a
// filename, in a chip) and behaved like plain text, which is exactly what he
// described.
//
// This does not invent a new document viewer. It points the SAME sourceFile
// at whichever existing route this app already uses for that kind of note:
// - a meeting note -> /meetings?note=<path>, the exact pattern
//   components/TaskEmailLink.tsx's TaskLinkedMeetings already uses and that
//   was confirmed working.
// - a customer/account note -> /accounts?a=<slug>, when the task's own
//   accountSlug is already resolved (no new lookup here).
// - an app-created task (lib/tasksDb.ts's DB_TASK_FILE, "db:tasks") has no
//   vault file behind it at all, so there is nothing to show or open.
// - anything else (a project/work note under 300 Merit/Projects, Sales Ops,
//   etc.) has no dedicated viewer route in this app yet; this returns a
//   label with no href rather than a link to nowhere, so the chip is
//   honestly "a reference" instead of a link that quietly does nothing.
//
// Kept pure and DB-free (no import of lib/tasksDb.ts, which pulls in the
// Drizzle client) so client components can call this directly.

// Mirrors lib/tasksDb.ts's DB_TASK_FILE constant. Duplicated as a literal
// rather than imported, since lib/tasksDb.ts is server-only (drizzle/db
// imports) and this module is used from client components.
const DB_TASK_SOURCE = "db:tasks";

export interface TaskSourceLink {
  label: string;
  href: string | null;
}

export function resolveTaskSourceLink(
  sourceFile: string,
  accountSlug?: string | null,
): TaskSourceLink | null {
  if (!sourceFile || sourceFile === DB_TASK_SOURCE) return null;
  const basename = sourceFile.split("/").pop() || sourceFile;

  if (sourceFile.includes("/Meetings/") && sourceFile.endsWith(".md")) {
    return { label: basename, href: `/meetings?note=${encodeURIComponent(sourceFile)}` };
  }
  if (sourceFile.startsWith("300 Merit/Customers/") && accountSlug) {
    return { label: basename, href: `/accounts?a=${encodeURIComponent(accountSlug)}` };
  }
  return { label: basename, href: null };
}
