import { and, eq, sql } from "drizzle-orm";
import {
  getDb,
  accounts as accountsT,
  tasks as tasksT,
  taskEmails as taskEmailsT,
  people as peopleT,
} from "@/lib/db";
import { cutoverActive } from "@/lib/dbSource";
import { todayISO } from "@/lib/dates";
import {
  addTaskUpdateForTaskId,
  formatStatusChangeText,
  formatDelegateChangeText,
} from "@/lib/taskUpdates";
import type { Priority, Task } from "@/lib/vault/types";

// DB-backed tasks (Phase 2 cutover). Identity rule: seeded rows keep their
// vault write-back coordinates (sourceFile:sourceLine), so task_meta keys and
// day-plan ids survive the flip UNCHANGED. App-created rows have no source
// file; their coordinates are (DB_TASK_FILE, <row id>), which makes their
// TaskView id "db:tasks:<id>".

export const DB_TASK_FILE = "db:tasks";

const APP_EDIT = { origin: "app", confirmedBy: "jordan" } as const;

function toPriority(v: string | null): Priority | undefined {
  return v === "high" || v === "med" || v === "low" ? v : undefined;
}

type TaskRow = typeof tasksT.$inferSelect;

// delegateName/delegateEmail come from a join on tasksT.ownerPersonId (dev-
// feedback #20): resolving "who this task is delegated to" into a display
// name here means every reader of Task (seeded rows included, since
// ownerPersonId was already populated at cutover-seed time from the vault's
// "Owner: <Name>" field) gets it for free, not just newly app-set delegates.
function rowToTask(row: TaskRow, delegateName?: string | null, delegateEmail?: string | null): Task {
  const customer =
    row.customer === "internal"
      ? ("internal" as const)
      : row.customer
        ? {
            target: row.customer,
            basename: row.customer,
            display: row.customer,
          }
        : undefined;
  return {
    done: row.done,
    title: row.text,
    fields: row.fields ?? {},
    description: row.description ?? "",
    notes: row.notes ?? "",
    workstream: row.workstream ?? undefined,
    customer,
    due: row.due ?? undefined,
    priority: toPriority(row.priority),
    created: row.createdField ?? undefined,
    scheduled: row.scheduled ?? undefined,
    thread: row.thread ?? undefined,
    taskStatus: row.status ?? undefined,
    completed: row.completed ?? undefined,
    delegate:
      row.ownerPersonId != null
        ? { personId: row.ownerPersonId, name: delegateName ?? "Unknown", email: delegateEmail ?? null }
        : undefined,
    sourceFile: row.sourcePath ?? DB_TASK_FILE,
    sourceLine: row.sourcePath != null ? row.sourceLine ?? 0 : row.id,
  };
}

// Jordan's tasks from the DB, or null when the cutover has not been seeded.
// Left join on people so delegate name/email ride along in one query instead
// of a per-task lookup.
export async function tasksFromDb(): Promise<Task[] | null> {
  if (!(await cutoverActive())) return null;
  const rows = await getDb()
    .select({
      task: tasksT,
      delegateName: peopleT.fullName,
      delegateEmail: peopleT.email,
    })
    .from(tasksT)
    .leftJoin(peopleT, eq(tasksT.ownerPersonId, peopleT.id))
    .where(eq(tasksT.isJordans, true));
  return rows.map((r) => rowToTask(r.task, r.delegateName, r.delegateEmail));
}

async function findRow(sourceFile: string, sourceLine: number): Promise<TaskRow | null> {
  const db = getDb();
  if (sourceFile === DB_TASK_FILE) {
    const [row] = await db.select().from(tasksT).where(eq(tasksT.id, sourceLine)).limit(1);
    return row ?? null;
  }
  const [row] = await db
    .select()
    .from(tasksT)
    .where(and(eq(tasksT.sourcePath, sourceFile), eq(tasksT.sourceLine, sourceLine)))
    .limit(1);
  return row ?? null;
}

// Complete/reopen a task in the DB. Origin flips to 'app' so a re-seed against
// a stale vault never reopens it.
export async function dbCompleteTask(
  sourceFile: string,
  sourceLine: number,
  done: boolean,
): Promise<{ commitSha: string; path: string }> {
  const row = await findRow(sourceFile, sourceLine);
  if (!row) throw new Error(`Task not found in DB: ${sourceFile}:${sourceLine}`);
  if (row.done !== done) {
    await getDb()
      .update(tasksT)
      .set({
        done,
        completed: done ? todayISO() : null,
        ...APP_EDIT,
        updatedAt: new Date(),
      })
      .where(eq(tasksT.id, row.id));
  }
  return { commitSha: "", path: sourceFile };
}

export interface UpdateTaskFieldInput {
  sourceFile: string;
  sourceLine: number;
  field: "account" | "type" | "status" | "due" | "delegate";
  value: string | null; // already validated/normalized by lib/taskUpdate.ts
}

// Task update log entry (dev-feedback #16 Part A, nice-to-have): note an
// inline-edit field change in the task's story, but only when the value
// actually moved and never more than once per call, so a select/date picker
// commit reads as one terse line, not one entry per keystroke. Best-effort:
// a logging hiccup must never fail the field write it is describing, which
// has already committed by the time this runs.
async function logFieldChange(
  taskId: number,
  field: "account" | "type" | "status" | "due",
  oldValue: string | null,
  newValue: string | null,
): Promise<void> {
  if ((oldValue ?? null) === (newValue ?? null)) return;
  try {
    await addTaskUpdateForTaskId(taskId, "status-change", formatStatusChangeText(field, newValue));
  } catch {
    /* logging is best-effort */
  }
}

// Inline edit from /tasks (dev-feedback #8): write one field straight to the
// task row. Mirrors dbCompleteTask's origin/updatedAt handling; no vault
// write, ever, the export renders the current DB state on demand.
export async function dbUpdateTaskField(input: UpdateTaskFieldInput): Promise<void> {
  const row = await findRow(input.sourceFile, input.sourceLine);
  if (!row) {
    throw new Error(`Task not found in DB: ${input.sourceFile}:${input.sourceLine}`);
  }
  const db = getDb();

  if (input.field === "account") {
    let accountId: number | null = null;
    if (input.value) {
      const [acc] = await db
        .select({ id: accountsT.id })
        .from(accountsT)
        .where(sql`lower(${accountsT.name}) = ${input.value.toLowerCase()}`)
        .limit(1);
      if (!acc) throw new Error(`Unknown account: ${input.value}`);
      accountId = acc.id;
    }
    await db
      .update(tasksT)
      .set({ customer: input.value, accountId, ...APP_EDIT, updatedAt: new Date() })
      .where(eq(tasksT.id, row.id));
    await logFieldChange(row.id, "account", row.customer ?? null, input.value);
    return;
  }

  if (input.field === "type") {
    const fields = { ...(row.fields ?? {}) };
    const oldType = fields.type ?? null;
    if (input.value) fields.type = input.value;
    else delete fields.type;
    await db
      .update(tasksT)
      .set({ fields, ...APP_EDIT, updatedAt: new Date() })
      .where(eq(tasksT.id, row.id));
    await logFieldChange(row.id, "type", oldType, input.value);
    return;
  }

  if (input.field === "status") {
    await db
      .update(tasksT)
      .set({ status: input.value, ...APP_EDIT, updatedAt: new Date() })
      .where(eq(tasksT.id, row.id));
    await logFieldChange(row.id, "status", row.status ?? null, input.value);
    return;
  }

  if (input.field === "due") {
    await db
      .update(tasksT)
      .set({ due: input.value, ...APP_EDIT, updatedAt: new Date() })
      .where(eq(tasksT.id, row.id));
    await logFieldChange(row.id, "due", row.due ?? null, input.value);
    return;
  }

  // field === "delegate" (dev-feedback #20 item 1). input.value is a
  // people.id, already validated against real people by
  // lib/taskUpdate.ts's validateTaskUpdate; "" / null clears the delegate.
  const newPersonId = input.value ? Number(input.value) : null;
  const oldPersonId = row.ownerPersonId ?? null;
  await db
    .update(tasksT)
    .set({ ownerPersonId: newPersonId, ...APP_EDIT, updatedAt: new Date() })
    .where(eq(tasksT.id, row.id));
  if (oldPersonId !== newPersonId) {
    try {
      let name: string | null = null;
      if (newPersonId != null) {
        const [p] = await db
          .select({ fullName: peopleT.fullName })
          .from(peopleT)
          .where(eq(peopleT.id, newPersonId))
          .limit(1);
        name = p?.fullName ?? null;
      }
      await addTaskUpdateForTaskId(row.id, "status-change", formatDelegateChangeText(name));
    } catch {
      /* logging is best-effort */
    }
  }
}

export interface CreateTaskInput {
  title: string;
  due?: string;
  priority?: string;
  customer?: string; // account display name, or "internal"
  workstream?: string;
  description?: string;
  emailIds?: number[]; // thread linkage -> task_emails
}

export interface CreatedTask {
  id: number;
  taskId: string; // TaskView id: "db:tasks:<id>"
}

// DB-first task creation (quick-add + thread composer). No vault write, ever:
// the export renders app-created tasks into the vault when Jordan runs it.
export async function dbCreateTask(input: CreateTaskInput): Promise<CreatedTask> {
  if (!(await cutoverActive())) {
    throw new Error(
      "Task creation needs the cutover seed (run /api/cutover/apply first).",
    );
  }
  const db = getDb();
  const title = input.title.trim();
  if (!title) throw new Error("A task title is required.");

  let accountId: number | null = null;
  if (input.customer && input.customer !== "internal") {
    const [acc] = await db
      .select({ id: accountsT.id })
      .from(accountsT)
      .where(sql`lower(${accountsT.name}) = ${input.customer.trim().toLowerCase()}`)
      .limit(1);
    accountId = acc?.id ?? null;
  }

  const [row] = await db
    .insert(tasksT)
    .values({
      text: title,
      done: false,
      due: input.due?.trim() || null,
      priority:
        input.priority === "high" || input.priority === "med" || input.priority === "low"
          ? input.priority
          : null,
      isJordans: true,
      description: input.description?.trim() || null,
      customer: input.customer?.trim() || null,
      workstream: input.workstream?.trim() || "merit",
      createdField: todayISO(),
      accountId,
      ...APP_EDIT,
    })
    .returning({ id: tasksT.id });

  if (input.emailIds?.length) {
    await db
      .insert(taskEmailsT)
      .values(input.emailIds.map((emailId) => ({ taskId: row.id, emailId })))
      .onConflictDoNothing();
  }

  return { id: row.id, taskId: `${DB_TASK_FILE}:${row.id}` };
}
