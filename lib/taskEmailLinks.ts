import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { tasks as tasksT, taskEmails as taskEmailsT, emails as emailsT } from "@/lib/db/schema";
import { accountNames } from "@/lib/firehose/read";
import { getOpenTasks } from "@/lib/vault";
import { listAccounts } from "@/lib/accounts";
import { toTaskView, buildAccountLookup, type TaskView } from "@/lib/taskView";
import {
  matchTasksForEmail as pureMatchTasksForEmail,
  matchEmailsForTask as pureMatchEmailsForTask,
  type MatchableTask,
  type MatchableEmail,
  type TaskEmailMatch,
  type EmailMatch,
} from "@/lib/taskEmailMatch";

export const DB_TASK_FILE = "db:tasks";

// DB-backed reads/writes for the task<->email link (dev-feedback #11). Every
// write here is a CONFIRMED link (Jordan approved it); this module never
// stores an unconfirmed suggestion. See lib/taskEmailMatch.ts for the pure
// scorer and lib/db/schema.ts for the task_emails table + provenance columns.

// Self-provisions the ai_generated/confirmed_by columns so the feature works
// even if `npm run db:push` has not been re-run against a live DB yet
// (mirrors the ensureFirehoseSchema pattern in lib/firehose/schema.ts).
let ensured: Promise<void> | null = null;
async function ensureProvenanceColumns(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    await db.execute(sql`alter table task_emails add column if not exists ai_generated boolean not null default false`);
    await db.execute(sql`alter table task_emails add column if not exists confirmed_by text`);
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}

function taskViewId(sourceFile: string, sourceLine: number): string {
  return sourceFile === DB_TASK_FILE ? `${DB_TASK_FILE}:${sourceLine}` : `${sourceFile}:${sourceLine}`;
}

// Resolve a TaskView identity (sourceFile/sourceLine) to the underlying
// tasks.id row, since task_emails is a real FK table keyed on the DB row, but
// seeded (vault-origin) TaskView ids carry their vault write-back coordinates
// instead. Small and local rather than importing lib/tasksDb.ts's private
// findRow, so this file has no edit surface in common with the concurrent
// inline-task-editing work in that module.
async function resolveTaskRowId(sourceFile: string, sourceLine: number): Promise<number | null> {
  const db = getDb();
  if (sourceFile === DB_TASK_FILE) return sourceLine;
  const [row] = await db
    .select({ id: tasksT.id })
    .from(tasksT)
    .where(and(eq(tasksT.sourcePath, sourceFile), eq(tasksT.sourceLine, sourceLine)))
    .limit(1);
  return row?.id ?? null;
}

export interface ConfirmLinkInput {
  sourceFile: string;
  sourceLine: number;
  emailIds: number[];
  aiGenerated: boolean; // true when this link came from a suggested match Jordan confirmed
}

// Write a CONFIRMED link. Called only after Jordan acts (confirm button in
// the thread view or the tasks page), never automatically.
export async function confirmTaskEmailLinks(
  input: ConfirmLinkInput,
): Promise<{ taskDbId: number }> {
  if (!dbConfigured()) throw new Error("Database not configured.");
  await ensureProvenanceColumns();
  const rowId = await resolveTaskRowId(input.sourceFile, input.sourceLine);
  if (rowId == null) {
    throw new Error(`Task not found in DB: ${input.sourceFile}:${input.sourceLine}`);
  }
  const ids = Array.from(new Set(input.emailIds)).filter((n) => Number.isInteger(n));
  if (ids.length) {
    const db = getDb();
    await db
      .insert(taskEmailsT)
      .values(
        ids.map((emailId) => ({
          taskId: rowId,
          emailId,
          aiGenerated: input.aiGenerated,
          confirmedBy: "jordan",
        })),
      )
      .onConflictDoUpdate({
        target: [taskEmailsT.taskId, taskEmailsT.emailId],
        set: { aiGenerated: input.aiGenerated, confirmedBy: "jordan" },
      });
  }
  return { taskDbId: rowId };
}

export interface LinkedTaskRef {
  taskId: string; // TaskView id
  title: string;
  done: boolean;
}

// Reverse lookup for the thread view: which tasks are confirmed-linked to any
// of these email ids ("Linked to task: [title]").
export async function linkedTasksForEmailIds(emailIds: number[]): Promise<LinkedTaskRef[]> {
  if (!dbConfigured() || !emailIds.length) return [];
  try {
    await ensureProvenanceColumns();
    const db = getDb();
    const rows = await db
      .select({
        taskId: tasksT.id,
        title: tasksT.text,
        done: tasksT.done,
        sourcePath: tasksT.sourcePath,
        sourceLine: tasksT.sourceLine,
      })
      .from(taskEmailsT)
      .innerJoin(tasksT, eq(taskEmailsT.taskId, tasksT.id))
      .where(inArray(taskEmailsT.emailId, emailIds));
    const seen = new Set<number>();
    const out: LinkedTaskRef[] = [];
    for (const r of rows) {
      if (seen.has(r.taskId)) continue;
      seen.add(r.taskId);
      out.push({
        taskId: taskViewId(r.sourcePath ?? DB_TASK_FILE, r.sourcePath != null ? r.sourceLine ?? 0 : r.taskId),
        title: r.title,
        done: r.done,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export interface LinkedEmailRef {
  emailId: number;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  threadKey: string;
  aiGenerated: boolean;
}

// Forward lookup for the tasks page: which emails are confirmed-linked to
// this task ("Linked emails (N)").
export async function linkedEmailsForTask(
  sourceFile: string,
  sourceLine: number,
): Promise<LinkedEmailRef[]> {
  if (!dbConfigured()) return [];
  try {
    await ensureProvenanceColumns();
    const rowId = await resolveTaskRowId(sourceFile, sourceLine);
    if (rowId == null) return [];
    const db = getDb();
    const rows = await db
      .select({
        emailId: emailsT.id,
        subject: emailsT.subject,
        fromName: emailsT.fromName,
        fromEmail: emailsT.fromEmail,
        threadId: emailsT.threadId,
        aiGenerated: taskEmailsT.aiGenerated,
      })
      .from(taskEmailsT)
      .innerJoin(emailsT, eq(taskEmailsT.emailId, emailsT.id))
      .where(eq(taskEmailsT.taskId, rowId))
      .orderBy(desc(emailsT.receivedAt));
    return rows.map((r) => ({
      emailId: r.emailId,
      subject: r.subject,
      fromName: r.fromName,
      fromEmail: r.fromEmail,
      threadKey: r.threadId ? `t:${r.threadId}` : `m:${r.emailId}`,
      aiGenerated: r.aiGenerated,
    }));
  } catch {
    return [];
  }
}

// ---- Matching wrappers (DB-fetching glue around the pure scorer) ----

function toMatchable(t: TaskView): MatchableTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    notes: t.notes ?? null,
    customer: t.customer ?? null,
  };
}

// All open tasks (minus nextech, which task views always filter) shaped for
// matching. Mirrors the fetch in lib/firehose/suggest.ts's
// suggestTasksForThread so both suggestion surfaces see the same task set.
async function openMatchableTasks(): Promise<MatchableTask[]> {
  const [tasks, accounts] = await Promise.all([
    getOpenTasks().catch(() => []),
    listAccounts().catch(() => []),
  ]);
  const lookup = buildAccountLookup(accounts);
  return tasks
    .map((t) => toTaskView(t, lookup))
    .filter((t) => t.workstream !== "nextech")
    .map(toMatchable);
}

// Thread view: "this email may complete..." Excludes tasks already
// confirmed-linked to this exact email so a re-view doesn't re-suggest what
// Jordan already acted on.
export async function suggestTasksForEmail(
  email: MatchableEmail,
  emailId: number | null,
  limit = 3,
): Promise<(TaskEmailMatch & { title: string })[]> {
  const tasks = await openMatchableTasks();
  const titleById = new Map(tasks.map((t) => [t.id, t.title]));
  const candidates = pureMatchTasksForEmail(tasks, email, limit + 5).map((c) => ({
    ...c,
    title: titleById.get(c.taskId) ?? c.taskId,
  }));
  if (!candidates.length) return [];
  if (emailId == null) return candidates.slice(0, limit);
  const already = await linkedTasksForEmailIds([emailId]).catch(() => []);
  const linkedIds = new Set(already.map((t) => t.taskId));
  return candidates.filter((c) => !linkedIds.has(c.taskId)).slice(0, limit);
}

export interface RecentEmailCandidate {
  key: string; // email id as a string
  emailId: number;
  subject: string | null;
  fromName: string | null;
  threadKey: string;
}

// Tasks page: "this recent email may complete this task." Scoped to inbound
// mail only, and to bodyPreview (not the full body) to respect the egress
// budget the inbox list scans already observe; a shorter signal window here
// is an acceptable tradeoff for a secondary surface (the thread view, which
// reads the full body it already loaded, is the primary one).
export async function suggestEmailsForTask(
  task: MatchableTask,
  sourceFile: string,
  sourceLine: number,
  accountId: number | null,
  limit = 3,
): Promise<(EmailMatch & { subject: string | null; fromName: string | null; threadKey: string })[]> {
  if (!dbConfigured()) return [];
  const db = getDb();
  const where =
    accountId != null
      ? and(eq(emailsT.accountId, accountId), eq(emailsT.direction, "inbound"))
      : eq(emailsT.direction, "inbound");
  const rows = await db
    .select({
      id: emailsT.id,
      threadId: emailsT.threadId,
      subject: emailsT.subject,
      fromName: emailsT.fromName,
      fromEmail: emailsT.fromEmail,
      bodyPreview: emailsT.bodyPreview,
      accountId: emailsT.accountId,
      direction: emailsT.direction,
    })
    .from(emailsT)
    .where(where)
    .orderBy(desc(emailsT.receivedAt))
    .limit(40);

  const inbound = rows.filter((r) => r.direction !== "outbound");
  const accountMap = await accountNames(
    inbound.map((r) => r.accountId).filter((n): n is number => n != null),
  ).catch(() => new Map());

  const candidates = inbound.map((r) => ({
    key: String(r.id),
    email: {
      accountName: r.accountId != null ? accountMap.get(r.accountId)?.name ?? null : null,
      subject: r.subject ?? "",
      bodyText: r.bodyPreview ?? "",
      fromName: r.fromName,
      fromEmail: r.fromEmail,
    } as MatchableEmail,
  }));

  const already = await linkedEmailsForTask(sourceFile, sourceLine).catch(() => []);
  const linkedIds = new Set(already.map((e) => e.emailId));

  const scored = pureMatchEmailsForTask(task, candidates, limit + 5).filter(
    (m) => !linkedIds.has(Number(m.emailKey)),
  );
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  return scored.slice(0, limit).map((m) => {
    const row = byId.get(m.emailKey)!;
    return {
      ...m,
      subject: row.subject,
      fromName: row.fromName,
      threadKey: row.threadId ? `t:${row.threadId}` : `m:${row.id}`,
    };
  });
}
