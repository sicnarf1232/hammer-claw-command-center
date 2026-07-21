import type { ChecklistStep } from "@/lib/taskMeta";

// Pure "N of M done" formatting for a task's checklist (dev-feedback #20
// item 3), shared by the collapsed-row badge and the expanded checklist
// header so both views agree on wording without either owning the other.
// Kept framework/DB-free per CLAUDE.md's convention for small pure helpers.

export function checklistProgress(steps: ChecklistStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

// null when there is nothing to show (an empty checklist should not render
// an empty "0/0" badge).
export function formatChecklistProgress(steps: ChecklistStep[]): string | null {
  if (!steps.length) return null;
  const { done, total } = checklistProgress(steps);
  return `${done}/${total}`;
}
