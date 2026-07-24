import { describe, it, expect } from "vitest";
import {
  classifyTask,
  classifyAttention,
  laneOverflow,
  matchesAttentionFilter,
  LANE_CAP,
} from "./attention";
import type { TaskView } from "./taskView";

// Plan section 4: the Now/Next/Watch precedence table, first match wins, plus
// the filter chip definitions. Pure and deterministic.

const TODAY = "2026-07-24"; // a Friday

const T = (over: Partial<TaskView> = {}): TaskView => ({
  id: `f.md:${Math.floor(Math.random() * 100000)}`,
  title: "Send the forecast",
  done: false,
  type: "Admin/Other",
  sourceFile: "f.md",
  sourceLine: 1,
  ...over,
});

const DELEGATE = { personId: 5, name: "Nick Patel" };

describe("classifyTask precedence (first match wins)", () => {
  it("done tasks are never shown", () => {
    expect(classifyTask(T({ done: true, due: "2026-07-01" }), TODAY)).toBeNull();
  });

  it("overdue, not waiting -> Now with day count", () => {
    const c = classifyTask(T({ due: "2026-07-22" }), TODAY);
    expect(c).toEqual({ lane: "now", reason: "Overdue 2 days" });
    expect(classifyTask(T({ due: "2026-07-23" }), TODAY)?.reason).toBe("Overdue 1 day");
  });

  it("due today, not waiting -> Now", () => {
    expect(classifyTask(T({ due: TODAY }), TODAY)).toEqual({
      lane: "now",
      reason: "Due today",
    });
  });

  it("overdue while waiting -> Now, chase it", () => {
    const c = classifyTask(T({ due: "2026-07-20", taskStatus: "waiting" }), TODAY);
    expect(c?.lane).toBe("now");
    expect(c?.reason).toMatch(/chase it/i);
  });

  it("due today while waiting -> Now, chase it (Codex plan clarification 2)", () => {
    const c = classifyTask(T({ due: TODAY, taskStatus: "waiting" }), TODAY);
    expect(c).toEqual({ lane: "now", reason: "Due today while waiting, chase it" });
  });

  it("blocked and due today is also Now (waiting/blocked share the rule)", () => {
    expect(classifyTask(T({ due: TODAY, taskStatus: "blocked" }), TODAY)?.lane).toBe("now");
  });

  it("high priority due within 2 days -> Now", () => {
    const c = classifyTask(T({ priority: "high", due: "2026-07-26" }), TODAY);
    expect(c).toEqual({ lane: "now", reason: "High priority, due 2026-07-26" });
  });

  it("waiting with a future due -> Watch, with delegate name when present", () => {
    expect(classifyTask(T({ taskStatus: "waiting", due: "2026-08-15" }), TODAY)).toEqual({
      lane: "watch",
      reason: "Waiting",
    });
    expect(
      classifyTask(T({ taskStatus: "blocked", delegatedTo: DELEGATE }), TODAY),
    ).toEqual({ lane: "watch", reason: "Blocked, with Nick Patel" });
  });

  it("delegated, not overdue, not waiting -> Watch 'With <name>'", () => {
    expect(classifyTask(T({ delegatedTo: DELEGATE }), TODAY)).toEqual({
      lane: "watch",
      reason: "With Nick Patel",
    });
  });

  it("delegated AND overdue -> Now (the clock beats the delegation)", () => {
    const c = classifyTask(T({ delegatedTo: DELEGATE, due: "2026-07-22" }), TODAY);
    expect(c?.lane).toBe("now");
  });

  it("due within 7 days -> Next with weekday", () => {
    expect(classifyTask(T({ due: "2026-07-27" }), TODAY)).toEqual({
      lane: "next",
      reason: "Due Monday",
    });
  });

  it("high priority with no due -> Next", () => {
    expect(classifyTask(T({ priority: "high" }), TODAY)).toEqual({
      lane: "next",
      reason: "High priority, no date",
    });
  });

  it("scheduled start within 7 days -> Next", () => {
    expect(classifyTask(T({ start: "2026-07-28" }), TODAY)).toEqual({
      lane: "next",
      reason: "Starts 2026-07-28",
    });
  });

  it("someday is NEVER Now/Next, even overdue; Watch only when delegated", () => {
    expect(classifyTask(T({ taskStatus: "someday", due: "2026-07-01" }), TODAY)).toBeNull();
    expect(
      classifyTask(T({ taskStatus: "someday", delegatedTo: DELEGATE }), TODAY),
    ).toEqual({ lane: "watch", reason: "With Nick Patel" });
  });

  it("malformed due strings are treated as no due, never NaN", () => {
    expect(classifyTask(T({ due: "next week" }), TODAY)).toBeNull();
    expect(classifyTask(T({ due: "next week", priority: "high" }), TODAY)).toEqual({
      lane: "next",
      reason: "High priority, no date",
    });
  });

  it("plain task with far/absent due -> rest (null)", () => {
    expect(classifyTask(T({}), TODAY)).toBeNull();
    expect(classifyTask(T({ due: "2026-09-01" }), TODAY)).toBeNull();
  });
});

describe("classifyAttention: lanes, sorting, rest", () => {
  it("splits, sorts by due then priority, and collects rest", () => {
    const views = [
      T({ id: "a", due: "2026-09-01" }), // rest
      T({ id: "b", due: TODAY, priority: "low" }),
      T({ id: "c", due: "2026-07-22" }), // most overdue first
      T({ id: "d", taskStatus: "waiting" }),
      T({ id: "e", due: "2026-07-27" }),
      T({ id: "f", done: true }),
    ];
    const r = classifyAttention(views, TODAY);
    expect(r.now.map((e) => e.view.id)).toEqual(["c", "b"]);
    expect(r.next.map((e) => e.view.id)).toEqual(["e"]);
    expect(r.watch.map((e) => e.view.id)).toEqual(["d"]);
    expect(r.rest.map((v) => v.id)).toEqual(["a"]);
  });

  it("same due date sorts high priority first", () => {
    const r = classifyAttention(
      [T({ id: "low", due: TODAY, priority: "low" }), T({ id: "hi", due: TODAY, priority: "high" })],
      TODAY,
    );
    expect(r.now.map((e) => e.view.id)).toEqual(["hi", "low"]);
  });

  it("empty input yields empty lanes", () => {
    expect(classifyAttention([], TODAY)).toEqual({ now: [], next: [], watch: [], rest: [] });
  });
});

describe("laneOverflow", () => {
  it("caps at LANE_CAP and counts the remainder", () => {
    const entries = Array.from({ length: LANE_CAP + 3 }, (_, i) => ({
      view: T({ id: `t${i}` }),
      reason: "Due today",
    }));
    const { visible, more } = laneOverflow(entries);
    expect(visible).toHaveLength(LANE_CAP);
    expect(more).toBe(3);
    expect(laneOverflow(entries.slice(0, 2)).more).toBe(0);
  });
});

describe("attention filter chips (plan definitions table)", () => {
  it("'With me' = no delegate set", () => {
    expect(matchesAttentionFilter(T({}), "with-me", TODAY)).toBe(true);
    expect(matchesAttentionFilter(T({ delegatedTo: DELEGATE }), "with-me", TODAY)).toBe(false);
  });

  it("'Waiting' = waiting or blocked", () => {
    expect(matchesAttentionFilter(T({ taskStatus: "waiting" }), "waiting", TODAY)).toBe(true);
    expect(matchesAttentionFilter(T({ taskStatus: "blocked" }), "waiting", TODAY)).toBe(true);
    expect(matchesAttentionFilter(T({}), "waiting", TODAY)).toBe(false);
  });

  it("'At risk' = overdue OR blocked (the overlap counts once, truthfully)", () => {
    expect(matchesAttentionFilter(T({ due: "2026-07-01" }), "at-risk", TODAY)).toBe(true);
    expect(matchesAttentionFilter(T({ taskStatus: "blocked" }), "at-risk", TODAY)).toBe(true);
    expect(
      matchesAttentionFilter(T({ due: "2026-07-01", taskStatus: "blocked" }), "at-risk", TODAY),
    ).toBe(true);
    expect(matchesAttentionFilter(T({ due: TODAY }), "at-risk", TODAY)).toBe(false);
    expect(matchesAttentionFilter(T({ taskStatus: "waiting" }), "at-risk", TODAY)).toBe(false);
  });

  it("'Due today' = due equals today; shared overdue semantics ignore bad dates", () => {
    expect(matchesAttentionFilter(T({ due: TODAY }), "due-today", TODAY)).toBe(true);
    expect(matchesAttentionFilter(T({ due: "2026-07-23" }), "due-today", TODAY)).toBe(false);
    expect(matchesAttentionFilter(T({ due: "someday soon" }), "at-risk", TODAY)).toBe(false);
  });

  it("'All' matches everything", () => {
    expect(matchesAttentionFilter(T({ done: true }), "all", TODAY)).toBe(true);
  });
});
