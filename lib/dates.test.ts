import { describe, it, expect } from "vitest";
import { needsDueDate, localParts, isLocalRunTime } from "./dates";

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

// These assume the default APP_TIMEZONE (America/Denver). The point of the
// helper is that it follows DST via the IANA zone rather than a fixed offset,
// so the summer and winter cases below deliberately use the same local hour
// against two different UTC instants.
describe("localParts", () => {
  it("converts a UTC instant to local wall-clock during MDT (UTC-6)", () => {
    // 2026-07-20 12:30 UTC = 06:30 local, a Monday.
    const p = localParts(new Date("2026-07-20T12:30:00Z"));
    expect(p.hour).toBe(6);
    expect(p.minute).toBe(30);
    expect(p.weekday).toBe(1);
  });

  it("converts a UTC instant to local wall-clock during MST (UTC-7)", () => {
    // 2026-12-14 13:30 UTC = 06:30 local, a Monday. One hour later in UTC than
    // the summer case, same local time: this is the DST bug the gate fixes.
    const p = localParts(new Date("2026-12-14T13:30:00Z"));
    expect(p.hour).toBe(6);
    expect(p.minute).toBe(30);
    expect(p.weekday).toBe(1);
  });

  it("reports midnight as hour 0, not 24", () => {
    expect(localParts(new Date("2026-07-20T06:00:00Z")).hour).toBe(0);
  });
});

describe("isLocalRunTime", () => {
  it("fires only on the matching local hour", () => {
    const at630 = new Date("2026-07-20T12:30:00Z"); // 06:30 local
    expect(isLocalRunTime(6, {}, at630)).toBe(true);
    expect(isLocalRunTime(7, {}, at630)).toBe(false);
  });

  it("fires on the same local hour in winter, an hour later in UTC", () => {
    expect(isLocalRunTime(6, {}, new Date("2026-12-14T13:30:00Z"))).toBe(true);
    // The old fixed-offset schedule would have fired here instead, an hour early.
    expect(isLocalRunTime(6, {}, new Date("2026-12-14T12:30:00Z"))).toBe(false);
  });

  it("honours the weekday gate for the weekly review", () => {
    // 2026-07-24 22:00 UTC = 16:00 local Friday.
    const friday = new Date("2026-07-24T22:00:00Z");
    expect(isLocalRunTime(16, { weekday: 5 }, friday)).toBe(true);
    // Same local hour, but a Thursday.
    const thursday = new Date("2026-07-23T22:00:00Z");
    expect(isLocalRunTime(16, { weekday: 5 }, thursday)).toBe(false);
  });
});
