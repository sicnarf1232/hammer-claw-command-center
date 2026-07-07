import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { aiProposals } from "@/lib/db/schema";
import { ensureProposalsSchema } from "./schema";
import { stageAction, stableStringify } from "./build";
import type { ProposalKind, ProposalRow, ProposalStatus } from "./types";

// Pending proposals older than this are lazily marked expired on list. Stale
// staged meetings are cheap to re-create with another pull.
const EXPIRY_DAYS = 30;

export interface StageInput {
  kind: ProposalKind;
  dedupeKey: string;
  parentId?: number | null;
  payload: unknown;
  summary: string;
  model: string | null;
}

export type StagedAction =
  | "staged"
  | "refreshed"
  | "unchanged"
  | "skipped-approved"
  | "skipped-rejected";

export interface StageResult {
  action: StagedAction;
  id: number | null;
}

function rowFrom(r: typeof aiProposals.$inferSelect): ProposalRow {
  return {
    id: r.id,
    kind: r.kind as ProposalKind,
    dedupeKey: r.dedupeKey,
    parentId: r.parentId,
    payload: r.payload,
    summary: r.summary,
    status: r.status as ProposalStatus,
    model: r.model,
    error: r.error,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    executedAt: r.executedAt,
  };
}

export async function latestProposalFor(
  kind: ProposalKind,
  dedupeKey: string,
): Promise<ProposalRow | null> {
  if (!dbConfigured()) return null;
  await ensureProposalsSchema();
  const [row] = await getDb()
    .select()
    .from(aiProposals)
    .where(and(eq(aiProposals.kind, kind), eq(aiProposals.dedupeKey, dedupeKey)))
    .orderBy(desc(aiProposals.id))
    .limit(1);
  return row ? rowFrom(row) : null;
}

// Stage (or refresh) a proposal. Approved/rejected proposals latch: staging
// skips them so a re-pull never resurrects a decided meeting. A pending
// proposal with an identical payload is a no-op; a changed payload is
// refreshed in place (same row id, so a linked child keeps its parent).
export async function stageProposal(input: StageInput): Promise<StageResult> {
  if (!dbConfigured()) {
    throw new Error("Database not configured; proposals cannot be staged.");
  }
  await ensureProposalsSchema();
  const db = getDb();
  const existing = await latestProposalFor(input.kind, input.dedupeKey);
  const changed =
    !existing || stableStringify(existing.payload) !== stableStringify(input.payload);
  const action = stageAction(existing?.status ?? null, changed);

  switch (action) {
    case "unchanged":
      return { action: "unchanged", id: existing!.id };
    case "skip-approved":
      return { action: "skipped-approved", id: existing!.id };
    case "skip-rejected":
      return { action: "skipped-rejected", id: existing!.id };
    case "refresh": {
      await db
        .update(aiProposals)
        .set({
          payload: input.payload,
          summary: input.summary,
          model: input.model,
          parentId: input.parentId ?? existing!.parentId,
          createdAt: new Date(),
        })
        .where(eq(aiProposals.id, existing!.id));
      return { action: "refreshed", id: existing!.id };
    }
    case "insert": {
      const [row] = await db
        .insert(aiProposals)
        .values({
          kind: input.kind,
          dedupeKey: input.dedupeKey,
          parentId: input.parentId ?? null,
          payload: input.payload,
          summary: input.summary,
          model: input.model,
          status: "pending",
        })
        .returning({ id: aiProposals.id });
      return { action: "staged", id: row?.id ?? null };
    }
  }
}

export async function listProposals(
  status: ProposalStatus = "pending",
): Promise<ProposalRow[]> {
  if (!dbConfigured()) return [];
  await ensureProposalsSchema();
  const db = getDb();
  if (status === "pending") {
    // Lazy expiry sweep.
    await db
      .update(aiProposals)
      .set({ status: "expired", decidedAt: new Date() })
      .where(
        and(
          eq(aiProposals.status, "pending"),
          lt(aiProposals.createdAt, sql`now() - interval '${sql.raw(String(EXPIRY_DAYS))} days'`),
        ),
      );
  }
  const rows = await db
    .select()
    .from(aiProposals)
    .where(eq(aiProposals.status, status))
    .orderBy(aiProposals.id);
  return rows.map(rowFrom);
}

export async function getProposal(id: number): Promise<ProposalRow | null> {
  if (!dbConfigured()) return null;
  await ensureProposalsSchema();
  const [row] = await getDb()
    .select()
    .from(aiProposals)
    .where(eq(aiProposals.id, id))
    .limit(1);
  return row ? rowFrom(row) : null;
}

// Reject a pending proposal; cascades to its pending children (a series update
// makes no sense once its meeting is rejected).
export async function rejectProposal(id: number): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(aiProposals)
    .set({ status: "rejected", decidedAt: now })
    .where(and(eq(aiProposals.id, id), eq(aiProposals.status, "pending")));
  await db
    .update(aiProposals)
    .set({ status: "rejected", decidedAt: now })
    .where(and(eq(aiProposals.parentId, id), eq(aiProposals.status, "pending")));
}

export async function markExecuted(id: number, warnings?: string | null): Promise<void> {
  const now = new Date();
  await getDb()
    .update(aiProposals)
    .set({
      status: "approved",
      decidedAt: now,
      executedAt: now,
      error: warnings ?? null,
    })
    .where(eq(aiProposals.id, id));
}

export async function markError(id: number, error: string): Promise<void> {
  await getDb()
    .update(aiProposals)
    .set({ status: "error", decidedAt: new Date(), error })
    .where(eq(aiProposals.id, id));
}

export async function pendingCount(): Promise<number> {
  if (!dbConfigured()) return 0;
  try {
    await ensureProposalsSchema();
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(aiProposals)
      .where(eq(aiProposals.status, "pending"));
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}
