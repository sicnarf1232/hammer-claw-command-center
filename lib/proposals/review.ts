import type { MeetingActionProposal, ActionReviewState } from "./types";

// Pure application of Jordan's review decisions onto a proposal's structured
// actions (Slice C). The store applies this to the pending payload; nothing
// here touches a database. Rules honored (docs/decisions/meeting-linking-rules.md):
//
//  - The original suggestion (candidatePersonIds, reasons, confidence) is
//    PRESERVED when Jordan changes or clears an owner; only the confirmed
//    fields and the review state move.
//  - Review states Jordan can set: assigned (with a person id), unassigned,
//    group, rejected, or suggested (revert to the suggestion).
//  - Wording edits go through `text` and preserve the action id; the original
//    extraction fields are immutable and never patched.
//  - Unknown action ids are ignored (a stale client cannot corrupt others).

export interface ActionReviewPatch {
  actionId: string;
  state: Extract<ActionReviewState, "assigned" | "unassigned" | "group" | "rejected" | "suggested">;
  personId?: number | null; // required for "assigned"
  text?: string; // approved wording edit (id-preserving)
  ownerText?: string; // corrected owner label (e.g. fixing a misheard name)
}

// ---- server-side validation of confirmed person ids (Codex round 1) ----
//
// A crafted or stale client can post any number as `personId`. The store
// validates BEFORE applying: ids must be positive integers, and each must be
// an existing, active (not superseded) person. The id deliberately does NOT
// have to be in the action's candidate list: Jordan may pick any valid active
// person from "Everyone". An invalid patch rejects the WHOLE update.

// Pure step 1: collect the person ids of `assigned` patches, rejecting
// malformed ones (decimal, zero, negative, missing, non-numeric).
export function collectAssignedPersonIds(
  patches: ActionReviewPatch[],
): { ok: true; ids: number[] } | { ok: false; error: string } {
  const ids: number[] = [];
  for (const p of patches) {
    if (p.state !== "assigned") continue;
    if (typeof p.personId !== "number" || !Number.isInteger(p.personId) || p.personId <= 0) {
      return {
        ok: false,
        error: `Assignment for ${p.actionId} needs a valid person id (got ${String(p.personId)}).`,
      };
    }
    ids.push(p.personId);
  }
  return { ok: true, ids };
}

// Pure step 2: which requested ids are not in the active-person set (either
// nonexistent or superseded). Non-empty result rejects the update.
export function missingPersonIds(ids: number[], activeIds: Set<number>): number[] {
  return [...new Set(ids)].filter((id) => !activeIds.has(id));
}

// Thrown by the store on validation failure; the API maps it to a 400.
export class InvalidActionReviewError extends Error {}

export function applyActionReviews(
  actions: MeetingActionProposal[],
  patches: ActionReviewPatch[],
  reviewedBy: string,
  now: () => string = () => new Date().toISOString(),
): MeetingActionProposal[] {
  const byId = new Map(patches.map((p) => [p.actionId, p]));
  return actions.map((a) => {
    const patch = byId.get(a.actionId);
    if (!patch) return a;
    if (patch.state === "assigned" && typeof patch.personId !== "number") {
      // An assignment without a person id is invalid; leave the action as-is
      // rather than fabricating a confirmation.
      return a;
    }
    return {
      ...a,
      text: typeof patch.text === "string" && patch.text.trim() ? patch.text.trim() : a.text,
      ownerText:
        typeof patch.ownerText === "string" ? patch.ownerText.trim() || null : a.ownerText,
      ownerReviewState: patch.state,
      confirmedPersonId:
        patch.state === "assigned" ? patch.personId! : null,
      reviewedBy,
      reviewedAt: now(),
    };
  });
}
