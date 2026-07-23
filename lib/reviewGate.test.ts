import { describe, it, expect } from "vitest";
import { approvalGate } from "./reviewGate";

// Codex round 1 finding 3: Approve must be structurally blocked while any
// action review is unsaved or mid-save. The components report panel states;
// this pure gate decides.

describe("approvalGate", () => {
  it("allows approval when no panels are dirty or saving", () => {
    expect(approvalGate([])).toEqual({ allowed: true, reason: null });
    expect(approvalGate([{ dirty: false, saving: false }])).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("blocks with a save-first explanation while a review is dirty", () => {
    const g = approvalGate([
      { dirty: false, saving: false },
      { dirty: true, saving: false },
    ]);
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/save action reviews/i);
  });

  it("blocks while a save is in flight", () => {
    const g = approvalGate([{ dirty: true, saving: true }]);
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/save to finish/i);
  });

  it("re-allows once the save succeeded and the panel is clean", () => {
    // The panel reports dirty:false saving:false after a successful save +
    // refresh; the gate opens again.
    expect(approvalGate([{ dirty: false, saving: false }]).allowed).toBe(true);
  });
});
