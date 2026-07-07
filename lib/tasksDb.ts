import { and, eq, sql } from "drizzle-orm";
import {
  getDb,
  accounts as accountsT,
  tasks as tasksT,
  taskEmails as taskEmailsT,
} from "@/lib/db";
import { cutoverActive } from "@/lib/dbSource";
import { todayISO } from "@/lib/dates";
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
