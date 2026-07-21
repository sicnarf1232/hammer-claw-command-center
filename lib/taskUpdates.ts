import { eq, and, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { tasks as tasksT } from "@/lib/db/schema";

// Per-task update log (dev-feedback #16 Part A). Turns a task from a static
// row + flat notes field into a living, timestamped record: manual notes
// Jordan types, plus automatic entries whenever a task<->email or
// task<->meeting link is confirmed, plus (best-effort) a note whenever a
// field actually changes via the inline-edit path.
//
// Self-provisioned, matching lib/taskMeetingLinks.ts's ensureTaskMeetingsSchema:
// this table has never existed anywhere, so the lazy path does the full
// CREATE, not an ALTER, and it is NOT added to lib/db/schema.ts (a concurrent
// build is actively editing that file for other reasons; the lazy-CREATE
// pattern is the established norm here for a small additive table, see also
// lib/pendingTaskLinks.ts).

export type TaskUpdateKind = "manual" | "email-linked" | "meeting-linked" | "status-change";

export interface TaskUpdateEntry {
  id: number;
  kind: TaskUpdateKind;
  text: string;
  sourceRef: string | null;
  createdAt: string; // ISO
}

// Duplicated locally rather than imported (same reasoning as
// lib/taskMeetingLinks.ts's own comment on resolveTaskRowId): this module is
// called FROM lib/taskEmailLinks.ts and lib/taskMeetingLinks.ts, so importing
// DB_TASK_FILE back from either would risk a circular import.
const DB_TASK_FILE = "db:tasks";

let ensured: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    await db.execute(sql`create table if not exists task_updates (
      id serial primary key,
      task_id integer not null,
      kind text not null,
      text text not null,
      source_ref text,
      created_at timestamptz not null default now()
    )`);
    await db.execute(
      sql`create index if not exists task_updates_task_id_idx on task_updates (task_id)`,
    );
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}

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

// Low-level insert when the caller already has the DB row id (the link-confirm
// flows resolve it anyway to write task_emails/task_meetings, so they call
// this directly rather than paying for a second sourceFile/sourceLine lookup).
export async function addTaskUpdateForTaskId(
  taskId: number,
  kind: TaskUpdateKind,
  text: string,
  sourceRef?: string | null,
): Promise<void> {
  if (!dbConfigured()) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  await ensureSchema();
  await getDb().execute(
    sql`insert into task_updates (task_id, kind, text, source_ref) values (${taskId}, ${kind}, ${trimmed}, ${sourceRef ?? null})`,
  );
}

// Coordinate-based entry point for the manual "Add update" affordance.
export async function addTaskUpdateForTask(
  sourceFile: string,
  sourceLine: number,
  kind: TaskUpdateKind,
  text: string,
  sourceRef?: string | null,
): Promise<{ taskDbId: number }> {
  if (!dbConfigured()) throw new Error("Database not configured.");
  const rowId = await resolveTaskRowId(sourceFile, sourceLine);
  if (rowId == null) {
    throw new Error(`Task not found in DB: ${sourceFile}:${sourceLine}`);
  }
  await addTaskUpdateForTaskId(rowId, kind, text, sourceRef);
  return { taskDbId: rowId };
}

// Read path: the task's story, newest first.
export async function listTaskUpdates(
  sourceFile: string,
  sourceLine: number,
): Promise<TaskUpdateEntry[]> {
  if (!dbConfigured()) return [];
  try {
    await ensureSchema();
    const rowId = await resolveTaskRowId(sourceFile, sourceLine);
    if (rowId == null) return [];
    const db = getDb();
    const res = await db.execute(
      sql`select id, kind, text, source_ref, created_at from task_updates where task_id = ${rowId} order by created_at desc, id desc`,
    );
    const rows = Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? []);
    return (rows as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      kind: (r.kind as TaskUpdateKind) ?? "manual",
      text: String(r.text ?? ""),
      sourceRef: (r.source_ref as string | null) ?? null,
      createdAt: new Date(r.created_at as string).toISOString(),
    }));
  } catch {
    return [];
  }
}

// ---- Pure formatting helpers (framework/DB-free, unit tested) ----

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseISODate(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { y: Number(m[1]), m: month, d: day };
}

// "Jul 26" — used in the terse status-change log line, no leading zero, no year.
export function formatMonthDay(iso: string | null | undefined): string | null {
  const p = parseISODate(iso);
  if (!p) return null;
  return `${MONTHS_SHORT[p.m - 1]} ${p.d}`;
}

// "Jul 14, 2026" — used for linked-meeting entries, where the year matters
// since a linked meeting can be from any point in the account's history.
export function formatMonthDayYear(iso: string | null | undefined): string | null {
  const p = parseISODate(iso);
  if (!p) return null;
  return `${MONTHS_SHORT[p.m - 1]} ${p.d}, ${p.y}`;
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// Cleans a task/email title of the vault's inline [field::value] markers so
// the log entry reads like plain prose (mirrors the cleanTitle helper
// duplicated across the task views).
function cleanText(s: string): string {
  return s.replace(/\[[A-Za-z][\w-]*::[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

export function formatEmailLinkedText(
  subject: string | null | undefined,
  fromName: string | null | undefined,
  fromEmail: string | null | undefined,
): string {
  const subj = cleanText(subject || "") || "(no subject)";
  const sender = (fromName && fromName.trim()) || (fromEmail && fromEmail.trim()) || "an unknown sender";
  return `Linked to email: "${subj}" from ${sender}.`;
}

export function formatMeetingLinkedText(
  title: string | null | undefined,
  date: string | null | undefined,
): string {
  const t = cleanText(title || "") || "(untitled meeting)";
  const when = formatMonthDayYear(date);
  return when ? `Linked to meeting: "${t}" (${when}).` : `Linked to meeting: "${t}".`;
}

export type StatusChangeField = "account" | "type" | "status" | "due";

export function formatStatusChangeText(field: StatusChangeField, value: string | null): string {
  switch (field) {
    case "account":
      return value ? `Account set to ${value}.` : "Account cleared.";
    case "type":
      return value ? `Type changed to ${value}.` : "Type cleared.";
    case "status":
      return `Status changed to ${value ? cap(value) : "Open"}.`;
    case "due": {
      const when = formatMonthDay(value);
      return when ? `Due date set to ${when}.` : "Due date cleared.";
    }
  }
}
