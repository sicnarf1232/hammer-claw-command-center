import { describe, it, expect } from "vitest";
import { needsDueDate } from "./dates";

describe("needsDueDate", () => {
  it("flags missing, TBD, and vague/non-ISO dues", () => {
    expect(needsDueDate(undefined)).toBe(true);
    expect(needsDueDate("")).toBe(true);
    expect(needsDueDate("   ")).toBe(true);
    expect(needsDueDate("TBD")).toBe(true);
    expect(needsDueDate("tbd")).toBe(true);
    expect(needsDueDate("Next week")).toBe(true);
    expect(needsDueDate("EOW")).toBe(true);
    expect(needsDueDate("2026-06-24 to 2026-06-30")).toBe(true);
  });

  it("does not flag a concrete ISO date", () => {
    expect(needsDueDate("2026-06-24")).toBe(false);
  });
});
