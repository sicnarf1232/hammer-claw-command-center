// Pure approval-gating logic for the proposal review queue (Slice C, Codex
// round 1 finding 3). A proposal (or the whole queue) must not be approvable
// while any structured action review is unsaved or mid-save: approving then
// would silently drop Jordan's selections. The UI components report their
// review panel state; this decides whether Approve is allowed and why not.

export interface ReviewPanelState {
  dirty: boolean; // selections made but not saved
  saving: boolean; // save request in flight
}

export interface ApprovalGate {
  allowed: boolean;
  reason: string | null; // user-facing explanation when not allowed
}

export function approvalGate(states: ReviewPanelState[]): ApprovalGate {
  if (states.some((s) => s.saving)) {
    return { allowed: false, reason: "Waiting for the action review save to finish." };
  }
  if (states.some((s) => s.dirty)) {
    return { allowed: false, reason: "Save action reviews before approving." };
  }
  return { allowed: true, reason: null };
}
