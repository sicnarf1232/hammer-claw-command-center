import { describe, it, expect } from "vitest";
import { checklistProgress, formatChecklistProgress, nextStepDue, stepDueColor } from "./checklistProgress";
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

const TODAY = "2026-07-21";

function step(over: Partial<ChecklistStep> & { id: string }): ChecklistStep {
  return { text: `step ${over.id}`, done: false, ...over };
}

describe("nextStepDue", () => {
  it("returns null when no step carries a date", () => {
    expect(nextStepDue([], TODAY)).toBeNull();
    expect(nextStepDue(steps([false, true]), TODAY)).toBeNull();
    expect(nextStepDue([step({ id: "a", due: null })], TODAY)).toBeNull();
  });

  it("picks the earliest-dated not-done step", () => {
    const list = [
      step({ id: "a", text: "give customer update", due: "2026-08-01" }),
      step({ id: "b", text: "get update from Scott", due: "2026-07-27" }),
      step({ id: "c", text: "undated step" }),
    ];
    expect(nextStepDue(list, TODAY)).toEqual({
      text: "get update from Scott",
      due: "2026-07-27",
      overdue: false,
    });
  });

  it("excludes done steps, even when they hold the earliest date", () => {
    const list = [
      step({ id: "a", text: "already handled", due: "2026-07-10", done: true }),
      step({ id: "b", text: "still open", due: "2026-08-01" }),
    ];
    expect(nextStepDue(list, TODAY)).toEqual({
      text: "still open",
      due: "2026-08-01",
      overdue: false,
    });
  });

  it("flags the next step as overdue when its date is past", () => {
    const list = [step({ id: "a", text: "chase it", due: "2026-07-15" })];
    expect(nextStepDue(list, TODAY)).toEqual({ text: "chase it", due: "2026-07-15", overdue: true });
  });

  it("does not flag a step due today as overdue", () => {
    expect(nextStepDue([step({ id: "a", due: TODAY })], TODAY)?.overdue).toBe(false);
  });

  it("returns null when every dated step is done", () => {
    expect(nextStepDue([step({ id: "a", due: "2026-07-01", done: true })], TODAY)).toBeNull();
  });
});

describe("stepDueColor", () => {
  it("colors an overdue open step with the due token", () => {
    expect(stepDueColor("2026-07-15", false, TODAY)).toBe("var(--due)");
  });

  it("colors a step due today with the warm token", () => {
    expect(stepDueColor(TODAY, false, TODAY)).toBe("var(--warm)");
  });

  it("mutes a future or missing date", () => {
    expect(stepDueColor("2026-08-01", false, TODAY)).toBe("var(--ink-3)");
    expect(stepDueColor(null, false, TODAY)).toBe("var(--ink-3)");
    expect(stepDueColor(undefined, false, TODAY)).toBe("var(--ink-3)");
  });

  it("mutes a done step's date even when it is past (never 'overdue')", () => {
    expect(stepDueColor("2026-07-01", true, TODAY)).toBe("var(--ink-3)");
    expect(stepDueColor(TODAY, true, TODAY)).toBe("var(--ink-3)");
  });
});
