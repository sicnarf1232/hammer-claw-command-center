import { describe, it, expect } from "vitest";
import {
  needsDueDate,
  localParts,
  isLocalRunTime,
  formatDateMDY,
  formatDateShort,
  formatRelativeTime,
} from "./dates";

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

describe("formatDateMDY", () => {
  it("formats a plain ISO date as MM/DD/YYYY", () => {
    expect(formatDateMDY("2026-07-26")).toBe("07/26/2026");
  });

  it("keeps zero-padded single-digit month and day", () => {
    expect(formatDateMDY("2026-01-05")).toBe("01/05/2026");
  });

  it("reads only the leading date off a full ISO timestamp", () => {
    expect(formatDateMDY("2026-12-31T23:59:00.000Z")).toBe("12/31/2026");
  });

  it("handles year boundaries", () => {
    expect(formatDateMDY("1999-12-31")).toBe("12/31/1999");
    expect(formatDateMDY("2000-01-01")).toBe("01/01/2000");
  });

  it("returns an empty string for invalid or empty input", () => {
    expect(formatDateMDY("")).toBe("");
    expect(formatDateMDY("TBD")).toBe("");
    expect(formatDateMDY("2026-13-01")).toBe(""); // month out of range
    expect(formatDateMDY("2026-06-00")).toBe(""); // day out of range
    expect(formatDateMDY(undefined as unknown as string)).toBe("");
    expect(formatDateMDY(null as unknown as string)).toBe("");
  });
});

describe("formatDateShort", () => {
  it("formats a plain ISO date as uppercase MMM DD", () => {
    expect(formatDateShort("2026-07-26")).toBe("JUL 26");
  });

  it("zero-pads a single-digit day", () => {
    expect(formatDateShort("2026-07-05")).toBe("JUL 05");
  });

  it("covers every month abbreviation", () => {
    expect(formatDateShort("2026-01-15")).toBe("JAN 15");
    expect(formatDateShort("2026-02-15")).toBe("FEB 15");
    expect(formatDateShort("2026-12-15")).toBe("DEC 15");
  });

  it("reads only the leading date off a full ISO timestamp", () => {
    expect(formatDateShort("2026-03-09T08:00:00.000Z")).toBe("MAR 09");
  });

  it("handles year boundaries without leaking the year into the label", () => {
    expect(formatDateShort("1999-12-31")).toBe("DEC 31");
    expect(formatDateShort("2000-01-01")).toBe("JAN 01");
  });

  it("returns an empty string for invalid or empty input", () => {
    expect(formatDateShort("")).toBe("");
    expect(formatDateShort("TBD")).toBe("");
    expect(formatDateShort("not-a-date")).toBe("");
    expect(formatDateShort("2026-00-10")).toBe(""); // month out of range
    expect(formatDateShort(undefined as unknown as string)).toBe("");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-20T12:00:00Z");

  it("reads under a minute as just now", () => {
    expect(formatRelativeTime(new Date("2026-07-20T11:59:45Z"), now)).toBe("just now");
  });

  it("reads minutes ago", () => {
    expect(formatRelativeTime(new Date("2026-07-20T11:45:00Z"), now)).toBe("15m ago");
  });

  it("reads hours ago", () => {
    expect(formatRelativeTime(new Date("2026-07-20T08:00:00Z"), now)).toBe("4h ago");
  });

  it("reads exactly one day as yesterday", () => {
    expect(formatRelativeTime(new Date("2026-07-19T12:00:00Z"), now)).toBe("yesterday");
  });

  it("reads several days ago", () => {
    expect(formatRelativeTime(new Date("2026-07-15T12:00:00Z"), now)).toBe("5d ago");
  });

  it("falls back to MM/DD/YYYY beyond about a month", () => {
    expect(formatRelativeTime(new Date("2026-05-01T12:00:00Z"), now)).toBe("05/01/2026");
  });

  it("returns an empty string for invalid or missing input", () => {
    expect(formatRelativeTime(null, now)).toBe("");
    expect(formatRelativeTime(undefined, now)).toBe("");
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
