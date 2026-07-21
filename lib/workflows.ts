import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import {
  normalizeEvidence,
  sanitizeSteps,
  isDuplicateWorkflowName,
  type WorkflowStatus,
  type WorkflowStep,
} from "@/lib/workflowLogic";

// Workflows (Main St. AI, dev-feedback #20's remaining half): Jordan's
// recurring end-to-end processes as editable, structured objects. This is the
// observability/trust layer ahead of BACKLOG item 15 (smart chaining): Jordan
// SEES and shapes his workflows here before any agent is ever allowed to act
// on one. v1 is discovery + display + full editability only; nothing in this
// module executes, routes, or sends anything.
//
// Provenance discipline (CLAUDE.md hard rule + docs/AGENTIC-TRIAGE.md):
// - Discovery inserts rows as status='suggested', ai_generated=true, with the
//   true model id from the API response and the evidence that led to it.
// - Nothing AI-suggested becomes a confirmed workflow without Jordan's
//   explicit action (Confirm, or editing-and-saving, which IS his judgment).
// - Confirming or editing stamps confirmed_by but NEVER flips ai_generated:
//   a workflow that originated from AI stays labeled that way, truthfully.
// - A manually created workflow is ai_generated=false, confirmed from birth.
//
// Self-provisioned (lazy CREATE TABLE IF NOT EXISTS with a module-level
// promise latch that resets on failure), matching lib/taskUpdates.ts's
// ensureSchema; NOT added to lib/db/schema.ts per the established norm for
// small additive tables while other builds touch that file.

export interface WorkflowRow {
  id: number;
  name: string;
  triggerSummary: string | null;
  steps: WorkflowStep[];
  status: WorkflowStatus;
  aiGenerated: boolean;
  confirmedBy: string | null;
  model: string | null;
  evidence: string[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

let ensured: Promise<void> | null = null;
async function ensureWorkflowsSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    await db.execute(sql`create table if not exists workflows (
      id serial primary key,
      name text not null,
      trigger_summary text,
      steps jsonb not null default '[]',
      status text not null default 'suggested',
      ai_generated boolean not null default true,
      confirmed_by text,
      model text,
      evidence jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
    await db.execute(
      sql`create index if not exists workflows_status_idx on workflows (status)`,
    );
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

function parseJsonish(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}

function toRow(r: Record<string, unknown>): WorkflowRow {
  const status = r.status === "confirmed" || r.status === "archived" ? r.status : "suggested";
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    triggerSummary: (r.trigger_summary as string | null) ?? null,
    steps: sanitizeSteps(parseJsonish(r.steps)),
    status,
    aiGenerated: Boolean(r.ai_generated),
    confirmedBy: (r.confirmed_by as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    evidence: normalizeEvidence(parseJsonish(r.evidence)),
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

// List everything, suggested first (newest within each status), so the UI can
// group without a second query. Archived rows ride along for completeness but
// the panel hides them.
export async function listWorkflows(): Promise<WorkflowRow[]> {
  if (!dbConfigured()) return [];
  try {
    await ensureWorkflowsSchema();
    const res = await getDb().execute(sql`
      select id, name, trigger_summary, steps, status, ai_generated,
             confirmed_by, model, evidence, created_at, updated_at
      from workflows
      order by case status when 'suggested' then 0 when 'confirmed' then 1 else 2 end,
               updated_at desc, id desc
    `);
    return rowsOf(res).map(toRow);
  } catch {
    return [];
  }
}

// Manual creation: Jordan wrote it himself, so it is confirmed from birth and
// honestly NOT ai_generated.
export async function createManualWorkflow(input: {
  name: string;
  triggerSummary: string | null;
  steps: WorkflowStep[];
}): Promise<WorkflowRow> {
  await ensureWorkflowsSchema();
  const res = await getDb().execute(sql`
    insert into workflows (name, trigger_summary, steps, status, ai_generated, confirmed_by, evidence)
    values (${input.name}, ${input.triggerSummary}, ${JSON.stringify(input.steps)}::jsonb,
            'confirmed', false, 'jordan', '[]'::jsonb)
    returning id, name, trigger_summary, steps, status, ai_generated,
              confirmed_by, model, evidence, created_at, updated_at
  `);
  const row = rowsOf(res)[0];
  if (!row) throw new Error("Insert returned no row.");
  return toRow(row);
}

// Full-content update (name/trigger/steps). Editing a SUGGESTED workflow and
// saving also confirms it: Jordan touching the content IS human judgment
// applied. ai_generated is deliberately left alone (provenance stays truthful:
// it still originated from AI); confirmed_by records who applied judgment.
export async function updateWorkflow(
  id: number,
  input: { name: string; triggerSummary: string | null; steps: WorkflowStep[] },
): Promise<WorkflowRow | null> {
  await ensureWorkflowsSchema();
  const res = await getDb().execute(sql`
    update workflows
    set name = ${input.name},
        trigger_summary = ${input.triggerSummary},
        steps = ${JSON.stringify(input.steps)}::jsonb,
        status = case when status = 'suggested' then 'confirmed' else status end,
        confirmed_by = coalesce(confirmed_by, 'jordan'),
        updated_at = now()
    where id = ${id}
    returning id, name, trigger_summary, steps, status, ai_generated,
              confirmed_by, model, evidence, created_at, updated_at
  `);
  const row = rowsOf(res)[0];
  return row ? toRow(row) : null;
}

export async function confirmWorkflow(id: number): Promise<boolean> {
  await ensureWorkflowsSchema();
  const res = await getDb().execute(sql`
    update workflows
    set status = 'confirmed', confirmed_by = 'jordan', updated_at = now()
    where id = ${id} and status = 'suggested'
    returning id
  `);
  return rowsOf(res).length > 0;
}

export async function archiveWorkflow(id: number): Promise<boolean> {
  await ensureWorkflowsSchema();
  const res = await getDb().execute(sql`
    update workflows
    set status = 'archived', updated_at = now()
    where id = ${id} and status <> 'archived'
    returning id
  `);
  return rowsOf(res).length > 0;
}

export async function deleteWorkflow(id: number): Promise<boolean> {
  await ensureWorkflowsSchema();
  const res = await getDb().execute(
    sql`delete from workflows where id = ${id} returning id`,
  );
  return rowsOf(res).length > 0;
}

// Discovery persistence: insert model suggestions as 'suggested' rows, skipping
// any whose name closely matches an existing NON-ARCHIVED workflow (the dedupe
// rule lives in lib/workflowLogic.ts; archived rows do not block, so a
// dismissed guess can come back improved). Returns what was inserted vs
// skipped so the route can report honest counts.
export async function insertSuggestedWorkflows(
  suggestions: Array<{
    name: string;
    triggerSummary: string | null;
    steps: WorkflowStep[];
    evidence: string[];
  }>,
  model: string,
): Promise<{ inserted: number; skipped: number }> {
  await ensureWorkflowsSchema();
  const existing = await listWorkflows();
  const liveNames = existing
    .filter((w) => w.status !== "archived")
    .map((w) => w.name);
  let inserted = 0;
  let skipped = 0;
  for (const s of suggestions) {
    if (isDuplicateWorkflowName(s.name, liveNames)) {
      skipped++;
      continue;
    }
    await getDb().execute(sql`
      insert into workflows (name, trigger_summary, steps, status, ai_generated, model, evidence)
      values (${s.name}, ${s.triggerSummary}, ${JSON.stringify(s.steps)}::jsonb,
              'suggested', true, ${model}, ${JSON.stringify(s.evidence)}::jsonb)
    `);
    liveNames.push(s.name); // a batch must not duplicate itself either
    inserted++;
  }
  return { inserted, skipped };
}
