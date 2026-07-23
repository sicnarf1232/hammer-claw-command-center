import { describe, it, expect } from "vitest";
import {
  approvalGate,
  combinePanelStates,
  gateForProposals,
  type ReviewPanelState,
} from "./reviewGate";

// Codex round 1 finding 3 + round 2 integration gaps: Approve must be
// structurally blocked while ANY unsaved edit exists (action reviews, note
// content, contact names), and a stale panel entry for a proposal that is no
// longer rendered must not keep blocking Approve all.

describe("approvalGate", () => {
  it("allows approval when no panels are dirty or saving", () => {
    expect(approvalGate([])).toEqual({ allowed: true, reason: null });
    expect(approvalGate([{ dirty: false, saving: false }])).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("blocks with a save-first explanation while anything is dirty", () => {
    const g = approvalGate([
      { dirty: false, saving: false },
      { dirty: true, saving: false },
    ]);
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/save edits before approving/i);
  });

  it("blocks while a save is in flight", () => {
    const g = approvalGate([{ dirty: true, saving: true }]);
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/save to finish/i);
  });

  it("re-allows once the save succeeded and the panel is clean", () => {
    expect(approvalGate([{ dirty: false, saving: false }]).allowed).toBe(true);
  });
});

describe("combinePanelStates: note/contact edits share the same gate", () => {
  it("a dirty content or contact-name edit blocks exactly like a dirty review", () => {
    const review: ReviewPanelState = { dirty: false, saving: false };
    const noteEdit: ReviewPanelState = { dirty: true, saving: false };
    const combined = combinePanelStates([review, noteEdit]);
    expect(combined).toEqual({ dirty: true, saving: false });
    const g = approvalGate([combined]);
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/save edits before approving/i);
  });

  it("a review save in flight surfaces as saving on the combined state", () => {
    expect(
      combinePanelStates([
        { dirty: false, saving: true },
        { dirty: false, saving: false },
      ]),
    ).toEqual({ dirty: false, saving: true });
  });

  it("all-clean combines to clean", () => {
    expect(
      combinePanelStates([
        { dirty: false, saving: false },
        { dirty: false, saving: false },
      ]),
    ).toEqual({ dirty: false, saving: false });
  });
});

describe("gateForProposals: stale entries cannot block", () => {
  it("a dirty entry for a proposal no longer rendered is ignored", () => {
    // Proposal 7 was rejected after its panel reported dirty; only 8 and 9 are
    // still rendered. The stale entry must not block Approve all.
    const states = {
      7: { dirty: true, saving: false },
      8: { dirty: false, saving: false },
      9: { dirty: false, saving: false },
    };
    expect(gateForProposals(states, [8, 9])).toEqual({ allowed: true, reason: null });
  });

  it("a dirty entry for a RENDERED proposal still blocks", () => {
    const states = {
      8: { dirty: true, saving: false },
      9: { dirty: false, saving: false },
    };
    const g = gateForProposals(states, [8, 9]);
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/save edits/i);
  });

  it("proposals that never reported state do not block", () => {
    expect(gateForProposals({}, [1, 2, 3]).allowed).toBe(true);
  });
});
