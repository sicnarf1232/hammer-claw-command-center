import { describe, it, expect } from "vitest";
import {
  seriesFolderForBucket,
  dominantBucket,
  seriesFilename,
  seriesDocPath,
  buildSeriesScaffold,
  defaultParticipants,
} from "./seriesCreate";
import { parseSeriesDoc, applyMeetingToSeries, matchesSeries } from "./series";

describe("placement", () => {
  it("puts internal series in Internal/Rolling and customers in their folder", () => {
    expect(seriesFolderForBucket("Internal")).toBe(
      "300 Merit/Meetings/Internal/Rolling",
    );
    expect(seriesFolderForBucket("Stryker")).toBe(
      "300 Merit/Meetings/Stryker/Rolling",
    );
  });
  it("picks the dominant bucket for a multi-bucket series", () => {
    expect(dominantBucket(["Stryker", "Becton Dickinson", "Stryker"])).toBe(
      "Stryker",
    );
    expect(dominantBucket([])).toBe("Internal");
  });
  it("names 1:1 files the <Person> 1on1 way, others sanitized", () => {
    expect(seriesFilename("Nick / Jordan 1:1", true)).toBe("Nick 1on1");
    expect(seriesFilename("Merit-Stryker Biweekly Connect", false)).toBe(
      "Merit-Stryker Biweekly Connect",
    );
  });
  it("builds a full repo path", () => {
    expect(seriesDocPath("Internal", "Nick / Jordan 1:1", true)).toBe(
      "300 Merit/Meetings/Internal/Rolling/Nick 1on1.md",
    );
  });
});

describe("defaultParticipants", () => {
  it("is Jordan + the other person for a 1:1", () => {
    expect(defaultParticipants("Nick / Jordan 1:1", true)).toEqual([
      "Jordan Francis",
      "Nick",
    ]);
  });
  it("is just Jordan otherwise", () => {
    expect(defaultParticipants("OEM-Quality weekly touch point", false)).toEqual(
      ["Jordan Francis"],
    );
  });
});

describe("buildSeriesScaffold", () => {
  const doc = buildSeriesScaffold({
    name: "Nick / Jordan 1:1",
    participants: ["Jordan Francis", "Nick Francis"],
    cadence: "Weekly",
    tags: ["sales"],
    createdISO: "2026-06-22",
  });

  it("round-trips through parseSeriesDoc", () => {
    const s = parseSeriesDoc(doc, "x/Nick 1on1.md");
    expect(s.name).toBe("Nick / Jordan 1:1");
    expect(s.cadence).toBe("Weekly");
    expect(s.participants).toEqual(["Jordan Francis", "Nick Francis"]);
    expect(s.status).toBe("active");
    expect(s.log).toHaveLength(0);
  });

  it("round-trips explicit matchRules and drives matching (manual create)", () => {
    const manual = buildSeriesScaffold({
      name: "Stryker Weekly Sync",
      participants: ["Alice Smith", "Bob Jones"],
      cadence: "Weekly",
      createdISO: "2026-07-09",
      matchRules: {
        titleContains: ["stryker", "weekly sync"],
        attendeesInclude: ["Alice Smith", "Bob Jones"],
      },
    });
    const s = parseSeriesDoc(manual, "x/Stryker Weekly Sync.md");
    expect(s.matchRules.titleContains).toEqual(["stryker", "weekly sync"]);
    expect(s.matchRules.attendeesInclude).toEqual(["Alice Smith", "Bob Jones"]);
    expect(s.currentState).toBe("(no current state captured)");
    expect(s.log).toHaveLength(0);

    // Title keyword alone is enough.
    expect(
      matchesSeries(s, { title: "Stryker check-in", attendees: [] }),
    ).toBe(true);
    // Attendee match with a tight attendee set (owner allowed as the one extra).
    expect(
      matchesSeries(s, {
        title: "Sync",
        attendees: ["Alice Smith", "Bob Jones", "Jordan Francis"],
      }),
    ).toBe(true);
    // Neither signal: no match.
    expect(
      matchesSeries(s, { title: "Random touch base", attendees: ["Charlie Day"] }),
    ).toBe(false);
  });

  it("omits the matchRules block when no explicit rules are given", () => {
    expect(doc).not.toContain("matchRules:");
    const s = parseSeriesDoc(doc, "x/Nick 1on1.md");
    expect(s.matchRules.attendeesInclude).toEqual(["Nick"]);
  });

  it("accepts a folded-in meeting (the create flow's per-meeting step)", () => {
    const out = applyMeetingToSeries(
      parseSeriesDoc(doc, "x"),
      {
        date: "2026-05-11",
        title: "Nick 1on1",
        bullets: ["May at $2.57M.", "QBRs not scheduled."],
        meetingBasename: "2026-05-11 - Nick 1on1",
      },
      "Pipeline review in flight.",
      "05/11",
    );
    const s = parseSeriesDoc(out, "x");
    expect(s.log).toHaveLength(1);
    expect(s.log[0].heading).toBe("05/11 — Nick 1on1");
    expect(s.currentState).toBe("Pipeline review in flight.");
  });
});
