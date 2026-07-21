import { describe, it, expect } from "vitest";
import { groupByDay, countByKind } from "./activityGroup";

interface Row {
  id: number;
  kind: string;
  createdAt: string;
}

describe("groupByDay", () => {
  const today = "2026-07-20";

  it("buckets rows by calendar day and labels today/yesterday", () => {
    const rows: Row[] = [
      { id: 1, kind: "due_today", createdAt: "2026-07-20T14:00:00Z" },
      { id: 2, kind: "new_email", createdAt: "2026-07-20T09:00:00Z" },
      { id: 3, kind: "brief", createdAt: "2026-07-19T07:00:00Z" },
      { id: 4, kind: "error", createdAt: "2026-07-10T07:00:00Z" },
    ];
    const groups = groupByDay(rows, (r) => r.createdAt, today);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "07/10/2026"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual([1, 2]);
    expect(groups[1].rows.map((r) => r.id)).toEqual([3]);
    expect(groups[2].rows.map((r) => r.id)).toEqual([4]);
  });

  it("preserves row order within a day (does not resort)", () => {
    // Both instants land on the same app-timezone (America/Denver, UTC-6 in
    // July) calendar day; a UTC time before 06:00 would roll back to the
    // previous local day, which is exactly the boundary this helper respects.
    const rows: Row[] = [
      { id: 2, kind: "a", createdAt: "2026-07-20T20:00:00Z" },
      { id: 1, kind: "a", createdAt: "2026-07-20T10:00:00Z" },
    ];
    const groups = groupByDay(rows, (r) => r.createdAt, today);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it("groups invalid or missing timestamps under Unknown date", () => {
    const rows: Row[] = [
      { id: 1, kind: "a", createdAt: "not-a-date" },
      { id: 2, kind: "a", createdAt: "" },
    ];
    const groups = groupByDay(rows, (r) => r.createdAt, today);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Unknown date");
    expect(groups[0].rows).toHaveLength(2);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByDay([], (r: Row) => r.createdAt, today)).toEqual([]);
  });
});

describe("countByKind", () => {
  it("counts rows per kind", () => {
    const rows: Row[] = [
      { id: 1, kind: "due_today", createdAt: "" },
      { id: 2, kind: "due_today", createdAt: "" },
      { id: 3, kind: "new_email", createdAt: "" },
    ];
    expect(countByKind(rows, (r) => r.kind)).toEqual({ due_today: 2, new_email: 1 });
  });

  it("returns an empty object for an empty list", () => {
    expect(countByKind([], (r: Row) => r.kind)).toEqual({});
  });
});
