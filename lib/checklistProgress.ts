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

// The earliest-dated NOT-done step: what the collapsed row whispers next to
// the N/M badge ("2/4 · next JUL 27"), so a task due 8/10 still surfaces the
// 7/27 internal step at a glance. Done steps and undated steps never count;
// null when no open step carries a date. ISO YYYY-MM-DD strings compare
// correctly as plain strings, so no Date parsing here.
export function nextStepDue(
  steps: ChecklistStep[],
  todayISO: string,
): { text: string; due: string; overdue: boolean } | null {
  let best: { text: string; due: string } | null = null;
  for (const s of steps) {
    if (s.done || !s.due) continue;
    if (!best || s.due < best.due) best = { text: s.text, due: s.due };
  }
  if (!best) return null;
  return { ...best, overdue: best.due < todayISO };
}

// Urgency color for a step's due date, matching the conventions the task's
// own due date already uses in both task views: overdue red (--due), due
// today warm (--warm), otherwise muted (--ink-3, the same gray as Tailwind's
// text-muted). A done step is never "overdue", so its date always renders
// muted regardless of the calendar.
export function stepDueColor(
  due: string | null | undefined,
  done: boolean,
  todayISO: string,
): string {
  if (!due || done) return "var(--ink-3)";
  if (due < todayISO) return "var(--due)";
  if (due === todayISO) return "var(--warm)";
  return "var(--ink-3)";
}
