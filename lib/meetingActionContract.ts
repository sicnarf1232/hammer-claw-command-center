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
// identity. original* == editable at first extraction, and the original and
// current extraction provenance are the same model.
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
    currentProvenance: provenance,
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
// (text/owner/due) follow the new extraction; the actionId, original* audit
// fields, sourceRef, and original `provenance` come from the prior, while
// `currentProvenance` records the model of THIS refresh. A prior owner link that
// was already confirmed (`assigned`) is preserved so reprocessing never
// overwrites a confirmed action; otherwise the owner state is recomputed.
function carryPrior(
  prior: MeetingActionProposal,
  item: TriagedActionItem,
  newFingerprint: string,
  currentProvenance: string,
): MeetingActionProposal {
  const ownerClass: OwnerClass = item.ownerClass ?? "unknown";
  const ownerConfirmed = prior.ownerReviewState === "assigned";
  return {
    actionId: prior.actionId, // carried, never recomputed from changed text
    fingerprint: newFingerprint, // hint reflects the current wording
    originalText: prior.originalText, // immutable audit
    originalOwnerText: prior.originalOwnerText, // immutable audit
    sourceRef: prior.sourceRef, // ties to the original extraction
    provenance: prior.provenance, // ORIGINAL extraction provenance (immutable)
    currentProvenance, // model of THIS refresh (the current editable text)
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
// existing stable ids so unchanged wording does not mint a different id. This is
// the fix for the real refresh boundary (stageGranolaMeetings refreshPending):
// building fresh would re-derive ids from the current text and lose identity.
//
// Reassociation is carried ONLY on reliable, deterministic evidence: an exact
// fingerprint match against a UNIQUE unconsumed prior action (i.e. the text did
// not change). A reworded action has a different fingerprint and cannot be
// distinguished from a removal + a new insertion (prior [A,B], refreshed [A,C]
// must not silently give C the identity and history of B), so it is treated as a
// new, unresolved action with a fresh id and left for human review. No positional
// or single-leftover elimination guessing is performed.
export function refreshActionProposals(
  prior: MeetingActionProposal[],
  actionItems: TriagedActionItem[],
  granolaId: string,
  currentProvenance: string,
): MeetingActionProposal[] {
  // Fresh identities/fingerprints for the new list (dup-text safe, order-stable).
  const minted = mintActionIdsForNote(
    granolaId,
    actionItems.map((a) => a.text),
  );
  const result: (MeetingActionProposal | null)[] = actionItems.map(() => null);
  const priorConsumed = new Array<boolean>(prior.length).fill(false);

  // Exact fingerprint match, only when the prior match is unambiguous. This is
  // the only reliable reassociation signal available here.
  actionItems.forEach((item, i) => {
    const fp = minted[i].fingerprint;
    const matches: number[] = [];
    for (let p = 0; p < prior.length; p++) {
      if (!priorConsumed[p] && prior[p].fingerprint === fp) matches.push(p);
    }
    if (matches.length === 1) {
      priorConsumed[matches[0]] = true;
      result[i] = carryPrior(prior[matches[0]], item, fp, currentProvenance);
    }
  });

  // Anything unmatched is genuinely new or a reworded/ambiguous extraction: mint
  // a fresh id and leave it unresolved. Prior actions with no match simply drop
  // out of the contract (Slice D reconciles those as removed/archivable by id).
  result.forEach((r, i) => {
    if (r === null) {
      result[i] = freshProposal(
        granolaId,
        actionItems[i],
        minted[i].actionId,
        minted[i].fingerprint,
        currentProvenance,
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
