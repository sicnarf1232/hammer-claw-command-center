import { sql } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";

// App-side augmentation of vault tasks: fast-changing state that does NOT belong
// in version control (per CLAUDE.md), keyed by the vault task id
// ("sourceFile:sourceLine"). The markdown task stays the source of truth; this
// tracks the checklist of internal steps, a linked email thread, and when we
// last sent the customer an update.

export interface ChecklistStep {
  id: string;
  text: string;
  done: boolean;
  owner?: string | null;
  blocking?: boolean;
}

export interface TaskMeta {
  taskId: string;
  checklist: ChecklistStep[];
  linkedThreadKey: string | null;
  lastCustomerUpdateISO: string | null;
  notes: string | null;
}

let ensured = false;
async function ensureSchema(): Promise<void> {
  if (ensured) return;
  await getDb().execute(sql`
    create table if not exists task_meta (
      task_id text primary key,
      checklist jsonb not null default '[]'::jsonb,
      linked_thread_key text,
      last_customer_update timestamptz,
      notes text,
      updated_at timestamptz not null default now()
    )
  `);
  ensured = true;
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

function toMeta(r: Record<string, unknown>): TaskMeta {
  const cl = r.checklist;
  return {
    taskId: String(r.task_id),
    checklist: Array.isArray(cl) ? (cl as ChecklistStep[]) : [],
    linkedThreadKey: r.linked_thread_key ? String(r.linked_thread_key) : null,
    lastCustomerUpdateISO: r.last_customer_update ? new Date(r.last_customer_update as string).toISOString() : null,
    notes: r.notes ? String(r.notes) : null,
  };
}

// Batch-load meta for a set of vault task ids. Missing ids simply have no row.
export async function getTaskMeta(taskIds: string[]): Promise<Map<string, TaskMeta>> {
  const out = new Map<string, TaskMeta>();
  if (!dbConfigured() || taskIds.length === 0) return out;
  try {
    await ensureSchema();
    const list = sql.join(taskIds.map((t) => sql`${t}`), sql`, `);
    const res = await getDb().execute(sql`select * from task_meta where task_id in (${list})`);
    for (const r of rowsOf(res)) {
      const m = toMeta(r);
      out.set(m.taskId, m);
    }
  } catch {
    // Table not provisionable (no DB): callers treat as "no meta".
  }
  return out;
}

async function upsert(taskId: string, set: ReturnType<typeof sql>): Promise<void> {
  if (!dbConfigured()) return;
  await ensureSchema();
  await getDb().execute(sql`
    insert into task_meta (task_id) values (${taskId})
    on conflict (task_id) do nothing
  `);
  await getDb().execute(sql`update task_meta set ${set}, updated_at = now() where task_id = ${taskId}`);
}

export async function setLinkedThread(taskId: string, threadKey: string | null): Promise<void> {
  await upsert(taskId, sql`linked_thread_key = ${threadKey}`);
}

export async function markCustomerUpdated(taskId: string): Promise<void> {
  await upsert(taskId, sql`last_customer_update = now()`);
}

export async function setChecklist(taskId: string, checklist: ChecklistStep[]): Promise<void> {
  const json = JSON.stringify(checklist);
  await upsert(taskId, sql`checklist = ${json}::jsonb`);
}

// Reverse lookup: which task ids are linked to each of these thread keys.
// Feeds the inbox "why this matters" context (2026-07-07 overhaul).
export async function taskIdsByLinkedThread(
  threadKeys: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const unique = Array.from(new Set(threadKeys)).filter(Boolean);
  if (!unique.length || !dbConfigured()) return out;
  try {
    await ensureSchema();
    const res = await getDb().execute(sql`
      select task_id, linked_thread_key from task_meta
      where linked_thread_key = any(${unique})
    `);
    for (const row of rowsOf(res)) {
      const key = String(row.linked_thread_key ?? "");
      const taskId = String(row.task_id ?? "");
      if (!key || !taskId) continue;
      const list = out.get(key) ?? [];
      list.push(taskId);
      out.set(key, list);
    }
  } catch {
    // table absent pre-first-use
  }
  return out;
}
