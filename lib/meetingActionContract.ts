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
// Slice B assigns stable identity and records the extraction, but does NOT
// resolve people or accounts: `candidatePersonIds` / `candidateAccountIds` stay
// empty and no individual owner is promoted past `unassigned`. The only owner
// state inferred here is `group`, and only from the roster classification
// already computed during the pull (a team/function owner, not a person guess).
// Account review is always `unassigned` in Slice B. This keeps uncertain matches
// unresolved for later human review.

// The owner review state Slice B is allowed to emit: a team/function owner is a
// `group`; everything else is left `unassigned` until the resolver runs.
function initialOwnerReviewState(ownerClass: OwnerClass): ActionReviewState {
  return ownerClass === "team" ? "group" : "unassigned";
}

// A stable, action-level reference to the ORIGINAL extraction: the transcript
// (granola id) plus the original-text fingerprint. Immutable audit; it does not
// change when Jordan later edits the wording.
export function actionSourceRef(granolaId: string, originalFingerprint: string): string {
  return `granola:${granolaId}#${originalFingerprint}`;
}

// Fresh contract for one action, from its triaged item and freshly minted
// identity. original* == editable at first extraction.
function freshProposal(
  granolaId: string,
  item: TriagedActionItem,
  actionId: string,
  fingerprint: string,
  provenance: string,
): MeetingActionProposal {
  const ownerClass: OwnerClass = item.ownerClass ?? "unknown";
  return {
    actionId,
    fingerprint,
    originalText: item.text,
    originalOwnerText: item.owner,
    sourceRef: actionSourceRef(granolaId, fingerprint),
    provenance,
    text: item.text,
    ownerText: item.owner,
    ownerClass,
    candidatePersonIds: [],
    candidateAccountIds: [],
    reasons: [],
    confidence: "none",
    ownerReviewState: initialOwnerReviewState(ownerClass),
    accountReviewState: "unassigned",
    isJordans: item.isJordans,
    due: item.due ?? null,
    dueText: item.dueText ?? null,
  };
}

export function buildActionProposals(
  granolaId: string,
  actionItems: TriagedActionItem[],
  provenance: string,
): MeetingActionProposal[] {
  const ids = mintActionIdsForNote(
    granolaId,
    actionItems.map((a) => a.text),
  );
  return actionItems.map((item, i) =>
    freshProposal(granolaId, item, ids[i].actionId, ids[i].fingerprint, provenance),
  );
}

// Re-derive an editable/approved proposal from a NEW extraction while carrying a
// prior action's stable identity and immutable audit record. Editable fields
// (text/owner/due) follow the new extraction; the original* audit fields,
// sourceRef, provenance, and actionId come from the prior. A prior owner link
// that was already confirmed (`assigned`) is preserved so reprocessing never
// overwrites a confirmed action; otherwise the owner state is recomputed.
function carryPrior(
  prior: MeetingActionProposal,
  item: TriagedActionItem,
  newFingerprint: string,
): MeetingActionProposal {
  const ownerClass: OwnerClass = item.ownerClass ?? "unknown";
  const ownerConfirmed = prior.ownerReviewState === "assigned";
  return {
    actionId: prior.actionId, // carried, never recomputed from changed text
    fingerprint: newFingerprint, // hint reflects the current wording
    originalText: prior.originalText, // immutable audit
    originalOwnerText: prior.originalOwnerText, // immutable audit
    sourceRef: prior.sourceRef, // ties to the original extraction
    provenance: prior.provenance, // original extraction provenance
    text: item.text, // editable follows the refreshed wording
    ownerText: ownerConfirmed ? prior.ownerText : item.owner,
    ownerClass: ownerConfirmed ? prior.ownerClass : ownerClass,
    candidatePersonIds: ownerConfirmed ? prior.candidatePersonIds : [],
    candidateAccountIds: prior.candidateAccountIds ?? [],
    reasons: ownerConfirmed ? prior.reasons : [],
    confidence: ownerConfirmed ? prior.confidence : "none",
    ownerReviewState: ownerConfirmed
      ? prior.ownerReviewState
      : initialOwnerReviewState(ownerClass),
    accountReviewState:
      prior.accountReviewState === "assigned" ? prior.accountReviewState : "unassigned",
    isJordans: item.isJordans,
    due: item.due ?? null,
    dueText: item.dueText ?? null,
  };
}

// Refresh the contract for an already-staged meeting from a NEW triage, carrying
// existing stable ids so changed wording does not mint a different id. This is
// the fix for the real refresh boundary (stageGranolaMeetings refreshPending):
// building fresh would re-derive ids from the current text and lose identity.
//
// Reassociation is deterministic only:
//   1. exact fingerprint match (text unchanged) against a unique unconsumed
//      prior action carries that prior id;
//   2. if, after step 1, exactly one prior action and one new action remain
//      unmatched, they are the same action by elimination and the id is carried
//      even though the wording changed;
//   3. anything still unmatched is genuinely ambiguous (several priors and
//      several reworded new actions) and gets a fresh id, left unresolved rather
//      than guessed by position.
export function refreshActionProposals(
  prior: MeetingActionProposal[],
  actionItems: TriagedActionItem[],
  granolaId: string,
  provenance: string,
): MeetingActionProposal[] {
  // Fresh identities/fingerprints for the new list (dup-text safe, order-stable).
  const minted = mintActionIdsForNote(
    granolaId,
    actionItems.map((a) => a.text),
  );
  const result: (MeetingActionProposal | null)[] = actionItems.map(() => null);
  const priorConsumed = new Array<boolean>(prior.length).fill(false);

  // Pass 1: exact fingerprint match, only when the prior match is unambiguous.
  actionItems.forEach((item, i) => {
    const fp = minted[i].fingerprint;
    const matches: number[] = [];
    for (let p = 0; p < prior.length; p++) {
      if (!priorConsumed[p] && prior[p].fingerprint === fp) matches.push(p);
    }
    if (matches.length === 1) {
      priorConsumed[matches[0]] = true;
      result[i] = carryPrior(prior[matches[0]], item, fp);
    }
  });

  // Pass 2: single leftover prior + single leftover new => same action by
  // elimination (deterministic), carry the id despite changed wording.
  const unmatchedNew = result
    .map((r, i) => (r === null ? i : -1))
    .filter((i) => i >= 0);
  const unmatchedPrior = priorConsumed
    .map((used, p) => (used ? -1 : p))
    .filter((p) => p >= 0);
  if (unmatchedNew.length === 1 && unmatchedPrior.length === 1) {
    const i = unmatchedNew[0];
    const p = unmatchedPrior[0];
    priorConsumed[p] = true;
    result[i] = carryPrior(prior[p], actionItems[i], minted[i].fingerprint);
  }

  // Pass 3: still unmatched => genuinely new or ambiguous, mint fresh (unresolved).
  result.forEach((r, i) => {
    if (r === null) {
      result[i] = freshProposal(
        granolaId,
        actionItems[i],
        minted[i].actionId,
        minted[i].fingerprint,
        provenance,
      );
    }
  });

  return result as MeetingActionProposal[];
}

// Attach the structured contract to a meeting payload's action fields. Kept tiny
// so the pull site (lib/meetingsPull.ts) stays declarative and the version stamp
// is set in exactly one place. `prior` (an already-staged proposal's actions)
// triggers the identity-preserving refresh path.
export function meetingActionContract(
  granolaId: string,
  actionItems: TriagedActionItem[],
  provenance: string,
  prior?: MeetingActionProposal[] | null,
): { contractVersion: number; actions: MeetingActionProposal[] } {
  return {
    contractVersion: MEETING_ACTION_CONTRACT_VERSION,
    actions:
      prior && prior.length
        ? refreshActionProposals(prior, actionItems, granolaId, provenance)
        : buildActionProposals(granolaId, actionItems, provenance),
  };
}
