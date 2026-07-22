import type { TriagedActionItem, OwnerClass } from "@/lib/ai";
import { mintActionIdsForNote } from "@/lib/meetingActionIdentity";
import {
  MEETING_ACTION_CONTRACT_VERSION,
  type MeetingActionProposal,
  type ActionReviewState,
} from "@/lib/proposals/types";

// Build the structured meeting-action contract (Slice B) from triaged action
// items. This is PURE: no DB, no AI, no network. It runs identically on the AI
// path and the template-passthrough path because both produce `TriagedActionItem`
// (owner string + isJordans + due), so both yield the same contract shape.
//
// Slice B assigns stable identity and carries the review scaffolding. It does
// NOT resolve people or accounts: `candidatePersonIds` / `candidateAccountIds`
// stay empty and no individual owner is promoted past `unassigned`. The only
// review state inferred here is `group`, and only from the roster classification
// already computed during the pull (a team/function owner, not a person guess).
// This keeps uncertain matches unresolved for later human review.

// The review state Slice B is allowed to emit. A team/function owner is a
// `group`; everything else is left `unassigned` until the resolver runs.
function initialReviewState(ownerClass: OwnerClass): ActionReviewState {
  return ownerClass === "team" ? "group" : "unassigned";
}

export function buildActionProposals(
  granolaId: string,
  actionItems: TriagedActionItem[],
): MeetingActionProposal[] {
  const ids = mintActionIdsForNote(
    granolaId,
    actionItems.map((a) => a.text),
  );
  return actionItems.map((ai, i) => {
    const ownerClass: OwnerClass = ai.ownerClass ?? "unknown";
    return {
      actionId: ids[i].actionId,
      fingerprint: ids[i].fingerprint,
      text: ai.text,
      ownerText: ai.owner,
      ownerClass,
      candidatePersonIds: [], // deferred: no person resolution in Slice B
      candidateAccountIds: [], // deferred: no account resolution in Slice B
      reasons: [], // deferred: the resolver writes structured evidence later
      confidence: "none",
      reviewState: initialReviewState(ownerClass),
      isJordans: ai.isJordans,
      due: ai.due ?? null,
      dueText: ai.dueText ?? null,
    };
  });
}

// Attach the structured contract to a meeting payload's action fields. Kept
// tiny so the pull site (lib/meetingsPull.ts) stays declarative and the version
// stamp is set in exactly one place.
export function meetingActionContract(
  granolaId: string,
  actionItems: TriagedActionItem[],
): { contractVersion: number; actions: MeetingActionProposal[] } {
  return {
    contractVersion: MEETING_ACTION_CONTRACT_VERSION,
    actions: buildActionProposals(granolaId, actionItems),
  };
}
