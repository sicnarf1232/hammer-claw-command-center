import { describe, it, expect } from "vitest";
import {
  cleanMeetingTitle,
  titleKey,
  detectSeriesCandidates,
  type DetectMeetingInput,
} from "./seriesDetect";
import { parseSeriesDoc } from "./series";

describe("cleanMeetingTitle", () => {
  it("strips a leading ISO date and trailing parentheticals", () => {
    expect(cleanMeetingTitle("2026-06-10 - Nick 1on1 (Pipeline Review)")).toBe(
      "Nick 1on1",
    );
    expect(cleanMeetingTitle("Mike 1on1 (Time-Spent Breakdown)")).toBe(
      "Mike 1on1",
    );
    expect(cleanMeetingTitle("Stryker Neuro Sync")).toBe("Stryker Neuro Sync");
  });
});

describe("titleKey", () => {
  it("keys recurring variants the same", () => {
    expect(titleKey("Nick 1on1")).toBe(titleKey("Nick 1on1 (Pipeline Review)"));
    expect(titleKey("2026-05-11 - Nick 1on1")).toBe(titleKey("Nick 1on1"));
  });
  it("drops cadence/format words", () => {
    expect(titleKey("Weekly Staff Sync")).toBe("staff");
    expect(titleKey("Staff Meeting")).toBe("staff");
  });
  it("falls back to the cleaned title when all tokens are stopwords", () => {
    expect(titleKey("Weekly Sync")).toBe("weekly sync");
  });
});

const M = (
  date: string,
  title: string,
  bucket = "Internal",
): DetectMeetingInput => ({
  date,
  title,
  bucket,
  noteBasename: `${date} - ${title}`,
  notePath: `300 Merit/Meetings/${date} - ${title}.md`,
});

describe("detectSeriesCandidates", () => {
  const meetings = [
    M("2026-06-10", "Nick 1on1 (Pipeline Review)"),
    M("2026-05-11", "Nick 1on1"),
    M("2026-04-15", "Nick 1on1"),
    M("2026-06-16", "Stryker Neuro Sync", "Customer"),
    M("2026-06-02", "Stryker Neuro Sync", "Customer"),
    M("2026-06-09", "AngioSafe Kickoff", "Customer"), // one-off, not recurring
  ];

  it("surfaces recurring meetings as candidates, newest activity first", () => {
    const c = detectSeriesCandidates(meetings);
    const names = c.map((x) => x.suggestedName);
    expect(names).toContain("Nick / Jordan 1:1");
    expect(names.some((n) => /Stryker Neuro/i.test(n))).toBe(true);
    // The one-off is excluded.
    expect(names.some((n) => /AngioSafe/i.test(n))).toBe(false);
  });

  it("flags 1:1s and names them <Person> / Jordan 1:1", () => {
    const c = detectSeriesCandidates(meetings);
    const nick = c.find((x) => x.suggestedName === "Nick / Jordan 1:1");
    expect(nick).toBeTruthy();
    expect(nick!.isOneOnOne).toBe(true);
    expect(nick!.count).toBe(3);
    expect(nick!.firstDate).toBe("2026-04-15");
    expect(nick!.lastDate).toBe("2026-06-10");
  });

  it("requires 2+ distinct dates (same-day duplicates don't count)", () => {
    const dupes = [
      M("2026-06-10", "Ops Review"),
      M("2026-06-10", "Ops Review"),
    ];
    expect(detectSeriesCandidates(dupes)).toHaveLength(0);
  });

  it("excludes meetings already covered by an existing series", () => {
    const existing = parseSeriesDoc(
      `---
type: Rolling Series
series: Nick / Jordan 1:1
participants: [Jordan Francis, Nick Francis]
status: active
---
# Nick / Jordan 1:1
## Meeting Log
`,
      "300 Merit/Meetings/Internal/Rolling/Nick 1on1.md",
    );
    const c = detectSeriesCandidates(meetings, [existing]);
    expect(c.some((x) => /Nick/i.test(x.suggestedName))).toBe(false);
    // Stryker (no existing series) still surfaces.
    expect(c.some((x) => /Stryker/i.test(x.suggestedName))).toBe(true);
  });
});
