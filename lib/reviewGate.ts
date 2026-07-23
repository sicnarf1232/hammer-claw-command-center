// Pure approval-gating logic for the proposal review queue (Slice C, Codex
// round 1 finding 3 + round 2 integration gaps). A proposal (or the whole
// queue) must not be approvable while ANY unsaved edit exists on it: structured
// action reviews, note-content edits, or contact-name edits all lose their
// changes if Approve executes the stored payload first. The UI components
// report their panel states; this decides whether Approve is allowed and why.

export interface ReviewPanelState {
  dirty: boolean; // unsaved changes (action reviews, note content, or contacts)
  saving: boolean; // save request in flight
}

export interface ApprovalGate {
  allowed: boolean;
  reason: string | null; // user-facing explanation when not allowed
}

export function approvalGate(states: ReviewPanelState[]): ApprovalGate {
  if (states.some((s) => s.saving)) {
    return { allowed: false, reason: "Waiting for the save to finish." };
  }
  if (states.some((s) => s.dirty)) {
    return { allowed: false, reason: "Save edits before approving." };
  }
  return { allowed: true, reason: null };
}

// Combine several panels on one card (the structured action review panel plus
// the note/contacts edit panel) into a single reported state.
export function combinePanelStates(states: ReviewPanelState[]): ReviewPanelState {
  return {
    dirty: states.some((s) => s.dirty),
    saving: states.some((s) => s.saving),
  };
}

// Queue-level gate derived ONLY from currently rendered proposals. A proposal
// rejected or removed after a refresh may leave a stale entry in the state
// map; keying by the visible ids means that stale entry can never keep
// blocking Approve all.
export function gateForProposals(
  panelStates: Record<number, ReviewPanelState>,
  visibleIds: number[],
): ApprovalGate {
  const visible = visibleIds
    .map((id) => panelStates[id])
    .filter((s): s is ReviewPanelState => !!s);
  return approvalGate(visible);
}
