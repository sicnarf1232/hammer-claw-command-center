import { describe, it, expect } from "vitest";
import {
  normalizeWorkflowName,
  isDuplicateWorkflowName,
  sanitizeSteps,
  moveStep,
  normalizeEvidence,
  type WorkflowStep,
} from "./workflowLogic";

describe("normalizeWorkflowName", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeWorkflowName("  Drawing  Request!!  ")).toBe("drawing request");
  });

  it("drops trailing generic words", () => {
    expect(normalizeWorkflowName("Quote Request Workflow")).toBe("quote request");
    expect(normalizeWorkflowName("Quote Request Process")).toBe("quote request");
    expect(normalizeWorkflowName("Drawing request handling process")).toBe(
      "drawing request",
    );
  });

  it("keeps generic words that are not a tail", () => {
    expect(normalizeWorkflowName("Process change notification")).toBe(
      "process change notification",
    );
  });
});

describe("isDuplicateWorkflowName", () => {
  it("matches an exact normalized name", () => {
    expect(isDuplicateWorkflowName("Quote request workflow", ["Quote Request"])).toBe(
      true,
    );
  });

  it("matches containment when both sides are 8+ chars", () => {
    expect(
      isDuplicateWorkflowName("Customer drawing request", ["Drawing request"]),
    ).toBe(true);
  });

  it("does not let short names swallow longer ones", () => {
    expect(isDuplicateWorkflowName("PO", ["Post-PO logistics"])).toBe(false);
    expect(isDuplicateWorkflowName("Post-PO logistics", ["PO"])).toBe(false);
  });

  it("treats distinct workflows as distinct", () => {
    expect(
      isDuplicateWorkflowName("Quality complaint intake", ["Quote request"]),
    ).toBe(false);
  });

  it("rejects an empty candidate", () => {
    expect(isDuplicateWorkflowName("  !! ", [])).toBe(true);
  });
});

describe("sanitizeSteps", () => {
  it("returns [] for non-arrays", () => {
    expect(sanitizeSteps(null)).toEqual([]);
    expect(sanitizeSteps("steps")).toEqual([]);
  });

  it("drops steps without a description and trims fields", () => {
    const out = sanitizeSteps([
      { description: "  Ask Scott for the drawing  ", personName: " Scott ", channel: "email" },
      { description: "", personName: "Nobody" },
      { personName: "Also nobody" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].description).toBe("Ask Scott for the drawing");
    expect(out[0].personName).toBe("Scott");
    expect(out[0].channel).toBe("email");
  });

  it("keeps a provided id and generates one when missing", () => {
    const out = sanitizeSteps([
      { id: "keep-me", description: "a" },
      { description: "b" },
    ]);
    expect(out[0].id).toBe("keep-me");
    expect(out[1].id).toBeTruthy();
  });

  it("rejects invalid channels and person ids", () => {
    const out = sanitizeSteps([
      { description: "x", channel: "carrier-pigeon", personId: -4 },
      { description: "y", personId: 7 },
    ]);
    expect(out[0].channel).toBeNull();
    expect(out[0].personId).toBeNull();
    expect(out[1].personId).toBe(7);
  });

  it("caps the number of steps at 12", () => {
    const raw = Array.from({ length: 20 }, (_, i) => ({ description: `step ${i}` }));
    expect(sanitizeSteps(raw)).toHaveLength(12);
  });
});

describe("moveStep", () => {
  const steps: WorkflowStep[] = [
    { id: "a", description: "A" },
    { id: "b", description: "B" },
    { id: "c", description: "C" },
  ];

  it("swaps with the neighbor in the given direction", () => {
    expect(moveStep(steps, 1, "up").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(moveStep(steps, 1, "down").map((s) => s.id)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the boundaries", () => {
    expect(moveStep(steps, 0, "up")).toBe(steps);
    expect(moveStep(steps, 2, "down")).toBe(steps);
    expect(moveStep(steps, 9, "up")).toBe(steps);
  });

  it("does not mutate the input", () => {
    moveStep(steps, 0, "down");
    expect(steps.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("normalizeEvidence", () => {
  it("keeps only non-empty strings, bounded", () => {
    expect(normalizeEvidence(["  a  ", "", 42, null, "b"])).toEqual(["a", "b"]);
  });

  it("caps count at 12 and length at 200", () => {
    const raw = Array.from({ length: 20 }, () => "x".repeat(300));
    const out = normalizeEvidence(raw);
    expect(out).toHaveLength(12);
    expect(out[0]).toHaveLength(200);
  });

  it("returns [] for non-arrays", () => {
    expect(normalizeEvidence({ seen: "in" })).toEqual([]);
  });
});
