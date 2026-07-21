import { describe, it, expect } from "vitest";
import { checklistProgress, formatChecklistProgress } from "./checklistProgress";
import type { ChecklistStep } from "./taskMeta";

function steps(pattern: boolean[]): ChecklistStep[] {
  return pattern.map((done, i) => ({ id: `s${i}`, text: `step ${i}`, done }));
}

describe("checklistProgress", () => {
  it("counts done vs total", () => {
    expect(checklistProgress(steps([true, false, true]))).toEqual({ done: 2, total: 3 });
  });

  it("returns zeroes for an empty checklist", () => {
    expect(checklistProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("formatChecklistProgress", () => {
  it("formats as 'done/total'", () => {
    expect(formatChecklistProgress(steps([true, false, true, false]))).toBe("2/4");
  });

  it("returns null for an empty checklist (no badge to show)", () => {
    expect(formatChecklistProgress([])).toBeNull();
  });

  it("formats all-done and all-open checklists", () => {
    expect(formatChecklistProgress(steps([true, true]))).toBe("2/2");
    expect(formatChecklistProgress(steps([false, false, false]))).toBe("0/3");
  });
});
