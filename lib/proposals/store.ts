import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { aiProposals } from "@/lib/db/schema";
import { ensureProposalsSchema } from "./schema";
import { stageAction, stableStringify } from "./build";
import { applyActionReviews, type ActionReviewPatch } from "./review";
import type {
  MeetingActionProposal,
  ProposalKind,
  ProposalRow,
  ProposalStatus,
} from "./types";

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
  // The source note changed after a rejection: a changed payload may be
  // staged fresh instead of staying latched.
  allowRestageRejected?: boolean;
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
  const action = stageAction(
    existing?.status ?? null,
    changed,
    input.allowRestageRejected ?? false,
  );

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

// Edit a PENDING meeting-file proposal in place before approval (Jordan fixing
// a typo in the note, or correcting the contacts it would add). Only the note
// content and the contact-name list are editable, and only while pending, so
// an already-decided proposal is never mutated. Returns the updated row, or
// null when the proposal is missing, not pending, or not a meeting file.
export interface MeetingProposalEdit {
  content?: string;
  contactNames?: string[]; // replaces contactsToAdd.names (empty clears it)
  // Structured action review decisions (Slice C): applied per action id onto
  // payload.actions via the pure applyActionReviews. Original suggestions are
  // preserved; only review state/confirmation move.
  actionReviews?: ActionReviewPatch[];
}

export async function updateMeetingProposal(
  id: number,
  edit: MeetingProposalEdit,
): Promise<ProposalRow | null> {
  if (!dbConfigured()) return null;
  await ensureProposalsSchema();
  const row = await getProposal(id);
  if (!row || row.status !== "pending" || row.kind !== "meeting-file") return null;

  const payload = { ...(row.payload as Record<string, unknown>) };
  if (typeof edit.content === "string") payload.content = edit.content;
  if (Array.isArray(edit.contactNames)) {
    const names = edit.contactNames.map((n) => n.trim()).filter(Boolean);
    const existing = (payload.contactsToAdd ?? null) as {
      accountPath: string;
      accountName: string;
      names: string[];
    } | null;
    // Names live under an accountPath/accountName the meeting already resolved;
    // we only ever edit the names, never invent an account link here. With no
    // existing contactsToAdd there is nothing to attach names to, so a name
    // edit is a no-op in that case.
    payload.contactsToAdd = existing ? { ...existing, names } : null;
  }
  if (Array.isArray(edit.actionReviews) && edit.actionReviews.length) {
    const actions = (payload.actions ?? null) as MeetingActionProposal[] | null;
    // Legacy payloads (staged before Slice B) carry no structured actions;
    // there is nothing to review on them.
    if (actions) {
      payload.actions = applyActionReviews(actions, edit.actionReviews, "jordan");
    }
  }

  const [updated] = await getDb()
    .update(aiProposals)
    .set({ payload })
    .where(and(eq(aiProposals.id, id), eq(aiProposals.status, "pending")))
    .returning();
  return updated ? rowFrom(updated) : null;
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
