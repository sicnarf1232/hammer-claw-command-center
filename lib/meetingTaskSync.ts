import type { TriagedActionItem } from "@/lib/ai";
import type { MeetingActionProposal } from "@/lib/proposals/types";
import { refreshActionProposals } from "@/lib/meetingActionContract";
import { actionFingerprint } from "@/lib/meetingActionIdentity";

// Slice D: the pure planner behind correct meeting-task persistence.
//
// Replaces the line-number-keyed sync inside `dbSaveMeetingContent()` (the
// Slice A characterization proved it corrupts identity on reorder and strands
// rows on removal). Given the canonical markdown's action items, the meeting's
// existing task rows, and — on the proposal-approval path — the reviewed
// structured actions, it plans exactly which rows to update, insert, or
// archive, keyed on the stable action id.
//
// Identity carry is deterministic only (same rule as the refresh boundary):
// an action id follows an exact, unique normalized-text fingerprint match.
// A reworded line cannot be told apart from a removal plus an insertion, so it
// becomes a NEW action and the old row is archived, never silently rewritten
// into a different action. (Id-preserving wording edits happen upstream, in
// the structured review, where the id is explicit.)
//
// Owner links honor the linking rules:
//  - only a CONFIRMED owner (`assigned`, confirmedPersonId) is written;
//  - a suggestion is never persisted as a link;
//  - an explicit reviewed "unassigned" clears the link;
//  - otherwise an existing row's owner_person_id is left untouched, so manual
//    links survive reprocessing.

export interface SyncMdItem {
  text: string; // owner prefix stripped, as parsed from the note
  owner: string | null;
  done: boolean;
  due: string | null;
  isJordans: boolean;
  sourceLine: number;
  priority: string | null;
}

export interface SyncTaskRow {
  id: number;
  actionId: string | null; // null = legacy row predating stable identity
  sourceLine: number | null;
  text: string;
  status: string | null;
}

export const ARCHIVED_STATUS = "archived";

interface WriteFields {
  actionId: string;
  text: string;
  done: boolean;
  due: string | null;
  isJordans: boolean;
  sourceLine: number;
  // undefined = leave the row's existing owner untouched (preserve manual
  // links); a number = write the confirmed link; null = explicit clear.
  ownerPersonId: number | null | undefined;
}

export interface TaskSyncPlan {
  updates: Array<WriteFields & { taskId: number }>;
  inserts: Array<WriteFields & { priority: string | null }>;
  archiveTaskIds: number[]; // rows to mark status='archived' (never deleted)
}

export interface PlanArgs {
  // Identity namespace for minting: the meeting's granola id, else its path.
  namespace: string;
  // Reviewed structured actions from the approved payload (proposal path), or
  // null on the editor/manual path.
  contractActions: MeetingActionProposal[] | null;
  mdItems: SyncMdItem[];
  existingRows: SyncTaskRow[];
}

export function planMeetingTaskSync(args: PlanArgs): TaskSyncPlan {
  const { namespace, mdItems, existingRows } = args;

  // 1) The prior identity source: the reviewed contract when present, else a
  // pseudo-contract reconstructed from rows that already carry an action id
  // (so the editor path keeps ids stable across reorders too).
  const prior: MeetingActionProposal[] =
    args.contractActions?.length
      ? args.contractActions
      : existingRows
          .filter((r): r is SyncTaskRow & { actionId: string } => !!r.actionId)
          .map((r) => pseudoAction(r.actionId, r.text));

  // 2) Carry ids onto the markdown's action list (exact unique fingerprint
  // only; anything else gets a fresh id). Result is index-aligned with mdItems.
  const finals = refreshActionProposals(
    prior,
    mdItems.map(toTriaged),
    namespace,
    "task-sync",
  );
  assertUniqueIds(finals.map((f) => f.actionId));

  // Review outcome per carried id (contract path only). refreshActionProposals
  // recomputes non-assigned states, so review decisions are re-read from the
  // prior contract itself, keyed by the carried id.
  const reviewById = new Map(
    (args.contractActions ?? []).map((a) => [a.actionId, a]),
  );

  // 3) Match finals to existing rows: stable id first, then legacy adoption.
  const byActionId = new Map<string, SyncTaskRow>();
  for (const r of existingRows) {
    if (r.actionId) byActionId.set(r.actionId, r);
  }
  const legacy = existingRows.filter((r) => !r.actionId);
  // Legacy rows by unique text fingerprint (ambiguous fingerprints excluded).
  const legacyByFp = new Map<string, SyncTaskRow | null>();
  for (const r of legacy) {
    const fp = actionFingerprint(r.text);
    legacyByFp.set(fp, legacyByFp.has(fp) ? null : r);
  }
  const legacyByLine = new Map<number, SyncTaskRow>();
  for (const r of legacy) {
    if (r.sourceLine != null) legacyByLine.set(r.sourceLine, r);
  }

  const updates: TaskSyncPlan["updates"] = [];
  const inserts: TaskSyncPlan["inserts"] = [];
  const matchedRowIds = new Set<number>();
  const archiveTaskIds: number[] = [];

  finals.forEach((final, i) => {
    const md = mdItems[i];
    const review = reviewById.get(final.actionId);
    const rejected = review?.ownerReviewState === "rejected";

    // Row lookup: stable id, else one-time legacy adoption by unique
    // fingerprint, else the legacy row on the same source line (the current
    // production identity for rows that never had an action id).
    let row = byActionId.get(final.actionId) ?? null;
    if (!row) {
      const fpHit = legacyByFp.get(actionFingerprint(md.text));
      if (fpHit && !matchedRowIds.has(fpHit.id)) row = fpHit;
    }
    if (!row) {
      const lineHit = legacyByLine.get(md.sourceLine);
      if (lineHit && !matchedRowIds.has(lineHit.id)) row = lineHit;
    }

    if (rejected) {
      // Jordan confirmed this extraction is not an action: never create a
      // task, and archive any row that exists for it.
      if (row) {
        matchedRowIds.add(row.id);
        if (row.status !== ARCHIVED_STATUS) archiveTaskIds.push(row.id);
      }
      return;
    }

    const ownerPersonId = ownerWrite(review);
    const fields: WriteFields = {
      actionId: final.actionId,
      text: md.text,
      done: md.done,
      due: md.due,
      isJordans: md.isJordans,
      sourceLine: md.sourceLine,
      ownerPersonId,
    };
    if (row) {
      matchedRowIds.add(row.id);
      updates.push({ ...fields, taskId: row.id });
    } else {
      inserts.push({
        ...fields,
        // An insert has no existing link to preserve: undefined becomes null.
        ownerPersonId: ownerPersonId === undefined ? null : ownerPersonId,
        priority: md.priority,
      });
    }
  });

  // 4) Rows whose action disappeared from the note: archive, never delete
  // (task ids stay referenced by task_meta / task_emails / task_meetings).
  for (const r of existingRows) {
    if (matchedRowIds.has(r.id)) continue;
    if (r.status === ARCHIVED_STATUS) continue;
    archiveTaskIds.push(r.id);
  }

  return { updates, inserts, archiveTaskIds };
}

// What to write for owner_person_id, per the linking rules. undefined = leave
// the existing value alone.
function ownerWrite(
  review: MeetingActionProposal | undefined,
): number | null | undefined {
  if (!review) return undefined;
  if (
    review.ownerReviewState === "assigned" &&
    typeof review.confirmedPersonId === "number"
  ) {
    return review.confirmedPersonId;
  }
  // An explicit, human-reviewed unassign clears the link; an unreviewed
  // unassigned leaves any manual link in place.
  if (review.ownerReviewState === "unassigned" && review.reviewedBy) return null;
  return undefined;
}

function toTriaged(md: SyncMdItem): TriagedActionItem {
  return {
    owner: md.owner,
    text: md.text,
    isJordans: md.isJordans,
    due: md.due ?? undefined,
  };
}

function pseudoAction(actionId: string, text: string): MeetingActionProposal {
  return {
    actionId,
    fingerprint: actionFingerprint(text),
    originalText: text,
    originalOwnerText: null,
    sourceRef: "",
    provenance: "task-sync",
    currentProvenance: "task-sync",
    text,
    ownerText: null,
    ownerClass: "unknown",
    candidatePersonIds: [],
    candidateAccountIds: [],
    reasons: [],
    confidence: "none",
    ownerReviewState: "unassigned",
    accountReviewState: "unassigned",
    isJordans: false,
    due: null,
    dueText: null,
  };
}

function assertUniqueIds(ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`Duplicate action id in task-sync plan: ${id}`);
    }
    seen.add(id);
  }
}
