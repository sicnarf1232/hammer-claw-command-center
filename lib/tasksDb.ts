import { and, eq, sql } from "drizzle-orm";
import {
  getDb,
  accounts as accountsT,
  tasks as tasksT,
  taskEmails as taskEmailsT,
} from "@/lib/db";
import { cutoverActive } from "@/lib/dbSource";
import { todayISO } from "@/lib/dates";
import { addTaskUpdateForTaskId, formatStatusChangeText } from "@/lib/taskUpdates";
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

function rowToTask(row: TaskRow): Task {
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
    sourceFile: row.sourcePath ?? DB_TASK_FILE,
    sourceLine: row.sourcePath != null ? row.sourceLine ?? 0 : row.id,
  };
}

// Jordan's tasks from the DB, or null when the cutover has not been seeded.
export async function tasksFromDb(): Promise<Task[] | null> {
  if (!(await cutoverActive())) return null;
  const rows = await getDb().select().from(tasksT).where(eq(tasksT.isJordans, true));
  return rows.map(rowToTask);
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
  field: "account" | "type" | "status" | "due";
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
  field: UpdateTaskFieldInput["field"],
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

  // field === "due"
  await db
    .update(tasksT)
    .set({ due: input.value, ...APP_EDIT, updatedAt: new Date() })
    .where(eq(tasksT.id, row.id));
  await logFieldChange(row.id, "due", row.due ?? null, input.value);
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
