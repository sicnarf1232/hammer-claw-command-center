import { describe, expect, it } from "vitest";
import { planTable, fieldsEqual, planCounts, type ExistingRow } from "./diff";

function ex(
  id: number,
  key: string,
  origin: string,
  fields: Record<string, unknown> = { name: key },
): ExistingRow {
  return { id, key, origin, fields };
}

describe("planTable", () => {
  it("inserts new, updates changed seed, keeps unchanged, removes seed orphans", () => {
    const plan = planTable(
      [
        ex(1, "acme", "seed", { name: "Acme", status: "active" }),
        ex(2, "globex", "seed", { name: "Globex", status: "active" }),
        ex(3, "gone-co", "seed", { name: "Gone Co", status: "active" }),
      ],
      [
        { key: "acme", fields: { name: "Acme", status: "active" } }, // unchanged
        { key: "globex", fields: { name: "Globex", status: "paused" } }, // changed
        { key: "initech", fields: { name: "Initech", status: "active" } }, // new
      ],
    );
    expect(plan.unchanged).toBe(1);
    expect(plan.update).toEqual([{ id: 2, fields: { name: "Globex", status: "paused" } }]);
    expect(plan.insert).toEqual([{ key: "initech", fields: { name: "Initech", status: "active" } }]);
    expect(plan.removeIds).toEqual([3]);
  });

  it("NEVER updates or removes app/proposal rows (the critical guarantee)", () => {
    const plan = planTable(
      [
        ex(10, "quick-add", "app", { name: "Quick add", status: "open" }),
        ex(11, "approved-meeting", "proposal", { name: "Filed by approval" }),
        ex(12, "edited-acct", "app", { name: "Edited in app", status: "active" }),
      ],
      [
        // Vault has a different version of the app-edited row: app wins.
        { key: "edited-acct", fields: { name: "Vault version", status: "stale" } },
        // Vault knows nothing about the other two: they must survive.
      ],
    );
    expect(plan.update).toEqual([]);
    expect(plan.removeIds).toEqual([]);
    expect(plan.insert).toEqual([]);
    expect(plan.protectedRows).toBe(3);
  });

  it("re-running the same plan input is a no-op (idempotent)", () => {
    const incoming = [{ key: "a", fields: { name: "A" } }];
    const afterFirstRun = [ex(1, "a", "seed", { name: "A" })];
    const plan = planTable(afterFirstRun, incoming);
    expect(planCounts(plan)).toEqual({
      insert: 0, update: 0, remove: 0, unchanged: 1, protected: 0,
    });
  });

  it("treats duplicate existing keys as seed orphans beyond the first", () => {
    const plan = planTable(
      [ex(1, "dup", "seed", { name: "Dup" }), ex(2, "dup", "seed", { name: "Dup" })],
      [{ key: "dup", fields: { name: "Dup" } }],
    );
    expect(plan.unchanged).toBe(1);
    expect(plan.removeIds).toEqual([2]);
  });
});

describe("fieldsEqual", () => {
  it("ignores key order and null-vs-undefined", () => {
    expect(fieldsEqual({ a: 1, b: null }, { b: undefined, a: 1 } as never)).toBe(true);
    expect(fieldsEqual({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } })).toBe(true);
  });
  it("catches value and array-order differences", () => {
    expect(fieldsEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(fieldsEqual({ a: "x" }, { a: "y" })).toBe(false);
  });
});
