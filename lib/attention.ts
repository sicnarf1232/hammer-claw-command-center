import type { TaskView } from "@/lib/taskView";

// Now / Next / Watch classification for the Today command lanes, plus the
// /tasks attention filter predicates. PURE and deterministic: no AI, no I/O,
// no invented data — every lane placement and reason derives from fields that
// exist on the task record. Scope contract:
// docs/plans/tasks-today-command-center.md section 4 (precedence, first match
// wins) and the filter definitions table.
//
// Shared date semantics: "overdue" and "due today" mean exactly the same
// thing here, in the filter chips, and on the cards. A malformed (non-ISO)
// due string is treated as NO due date, never NaN math.

export type Lane = "now" | "next" | "watch";

export interface LaneEntry {
  view: TaskView;
  reason: string;
}

export interface LaneResult {
  now: LaneEntry[];
  next: LaneEntry[];
  watch: LaneEntry[];
  // Open tasks that matched no lane; the lanes UI links to the full board.
  rest: TaskView[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Valid ISO due (or scheduled) date, else undefined. Non-ISO strings ("next
// week") carry no comparable date and must never produce NaN comparisons.
function isoOrUndefined(d: string | undefined): string | undefined {
  return d && ISO_DATE_RE.test(d) ? d : undefined;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000,
  );
}

// ISO date `days` after `today`, for "within N days" comparisons.
function addDays(todayISO: string, days: number): string {
  return new Date(Date.parse(`${todayISO}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

function isWaiting(t: TaskView): boolean {
  return t.taskStatus === "waiting" || t.taskStatus === "blocked";
}

function isOverdue(t: TaskView, today: string): boolean {
  const due = isoOrUndefined(t.due);
  return !!due && due < today;
}

function isDueToday(t: TaskView, today: string): boolean {
  return isoOrUndefined(t.due) === today;
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(iso: string): string {
  return WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

// Classify ONE open task. Returns null for "rest" (no lane). First match wins,
// in exactly the plan's precedence order.
export function classifyTask(
  t: TaskView,
  today: string,
): { lane: Lane; reason: string } | null {
  if (t.done) return null; // never shown

  // Plan invariant: `someday` is never Now/Next regardless of dates; it
  // reaches Watch only when delegated, else it stays on the board (rest).
  if (t.taskStatus === "someday") {
    return t.delegatedTo
      ? { lane: "watch", reason: `With ${t.delegatedTo.name}` }
      : null;
  }

  const due = isoOrUndefined(t.due);
  const waiting = isWaiting(t);
  const overdue = isOverdue(t, today);
  const dueToday = isDueToday(t, today);

  if (overdue && !waiting) {
    return { lane: "now", reason: `Overdue ${daysBetween(due!, today)} day${daysBetween(due!, today) === 1 ? "" : "s"}` };
  }
  if (dueToday && !waiting) {
    return { lane: "now", reason: "Due today" };
  }
  if (overdue && waiting) {
    return { lane: "now", reason: "Overdue while waiting, chase it" };
  }
  if (dueToday && waiting) {
    return { lane: "now", reason: "Due today while waiting, chase it" };
  }
  if (t.priority === "high" && due && due <= addDays(today, 2)) {
    return { lane: "now", reason: `High priority, due ${due}` };
  }

  // Watch: the clock is not pressing (due today/overdue already handled), and
  // someone or something else holds the ball. `someday` is never Now/Next; it
  // reaches Watch only when delegated.
  if (waiting) {
    const label = t.taskStatus === "blocked" ? "Blocked" : "Waiting";
    return {
      lane: "watch",
      reason: t.delegatedTo ? `${label}, with ${t.delegatedTo.name}` : label,
    };
  }
  if (t.delegatedTo) {
    return { lane: "watch", reason: `With ${t.delegatedTo.name}` };
  }

  if (due && due <= addDays(today, 7)) {
    return { lane: "next", reason: `Due ${weekdayOf(due)}` };
  }
  if (t.priority === "high" && !due) {
    return { lane: "next", reason: "High priority, no date" };
  }
  const start = isoOrUndefined(t.start);
  if (start && start <= addDays(today, 7)) {
    return { lane: "next", reason: `Starts ${start}` };
  }

  return null;
}

const PRIORITY_RANK: Record<string, number> = { high: 0, med: 1, low: 2 };

// Lane sort: due asc (missing due last), then priority (high > med > low).
export function laneSort(a: TaskView, b: TaskView): number {
  const da = isoOrUndefined(a.due) ?? "9999-99-99";
  const db = isoOrUndefined(b.due) ?? "9999-99-99";
  if (da !== db) return da < db ? -1 : 1;
  return (PRIORITY_RANK[a.priority ?? ""] ?? 3) - (PRIORITY_RANK[b.priority ?? ""] ?? 3);
}

export function classifyAttention(views: TaskView[], today: string): LaneResult {
  const now: LaneEntry[] = [];
  const next: LaneEntry[] = [];
  const watch: LaneEntry[] = [];
  const rest: TaskView[] = [];
  for (const view of views) {
    if (view.done) continue;
    const c = classifyTask(view, today);
    if (!c) {
      rest.push(view);
    } else if (c.lane === "now") {
      now.push({ view, reason: c.reason });
    } else if (c.lane === "next") {
      next.push({ view, reason: c.reason });
    } else {
      watch.push({ view, reason: c.reason });
    }
  }
  const byView = (x: LaneEntry, y: LaneEntry) => laneSort(x.view, y.view);
  now.sort(byView);
  next.sort(byView);
  watch.sort(byView);
  return { now, next, watch, rest };
}

// Lanes show at most this many cards; the remainder is a plain "View all
// tasks" link (no matching-filter claim; /tasks takes no URL filter state).
export const LANE_CAP = 7;

export function laneOverflow(entries: LaneEntry[]): {
  visible: LaneEntry[];
  more: number;
} {
  return {
    visible: entries.slice(0, LANE_CAP),
    more: Math.max(0, entries.length - LANE_CAP),
  };
}

// ---- /tasks attention filter chips (plan definitions table) ----

export type AttentionFilter = "all" | "with-me" | "waiting" | "at-risk" | "due-today";

export const ATTENTION_FILTERS: Array<{ key: AttentionFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "with-me", label: "With me" },
  { key: "waiting", label: "Waiting" },
  { key: "at-risk", label: "At risk" },
  { key: "due-today", label: "Due today" },
];

export function matchesAttentionFilter(
  t: TaskView,
  filter: AttentionFilter,
  today: string,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "with-me":
      // Jordan is the actor: no delegate set. (Truthful rename of "Mine".)
      return !t.delegatedTo;
    case "waiting":
      return isWaiting(t);
    case "at-risk":
      return isOverdue(t, today) || t.taskStatus === "blocked";
    case "due-today":
      return isDueToday(t, today);
  }
}
