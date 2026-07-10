import { describe, it, expect } from "vitest";
import { inferCadenceFromDates } from "./seriesDerive";

describe("inferCadenceFromDates", () => {
  it("needs at least three dated meetings", () => {
    expect(inferCadenceFromDates([])).toBeNull();
    expect(inferCadenceFromDates(["2026-06-01"])).toBeNull();
    expect(inferCadenceFromDates(["2026-06-01", "2026-06-08"])).toBeNull();
    expect(inferCadenceFromDates(["2026-06-01", null, undefined])).toBeNull();
    // duplicates collapse, so three copies of one date are still one meeting
    expect(
      inferCadenceFromDates(["2026-06-01", "2026-06-01", "2026-06-01"]),
    ).toBeNull();
  });

  it("detects weekly spacing", () => {
    expect(
      inferCadenceFromDates(["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"]),
    ).toBe("weekly");
    // one skipped week does not break the read (median gap)
    expect(
      inferCadenceFromDates(["2026-06-01", "2026-06-08", "2026-06-22", "2026-06-29"]),
    ).toBe("weekly");
  });

  it("detects biweekly and monthly spacing", () => {
    expect(
      inferCadenceFromDates(["2026-05-04", "2026-05-18", "2026-06-01", "2026-06-15"]),
    ).toBe("biweekly");
    expect(
      inferCadenceFromDates(["2026-03-10", "2026-04-09", "2026-05-11"]),
    ).toBe("monthly");
  });

  it("calls widely scattered dates ad hoc", () => {
    expect(
      inferCadenceFromDates(["2026-01-05", "2026-03-20", "2026-06-30"]),
    ).toBe("ad hoc");
  });

  it("ignores order and non-ISO values", () => {
    expect(
      inferCadenceFromDates(["2026-06-15", "junk", "2026-06-01", "2026-06-08"]),
    ).toBe("weekly");
  });
});
