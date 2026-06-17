import { describe, it, expect } from "vitest";
import {
  parseSeriesDoc,
  matchesSeries,
  applyMeetingToSeries,
  mmdd,
} from "./series";

const SAMPLE = `---
type: rolling-series
id: mike-1on1
name: Mike / Jordan 1:1
cadence: Weekly (Tuesdays)
participants: [Jordan Francis, Mike]
matchRules:
  titleContains: [mike]
  titleAlsoContains: ["1:1", "1on1", "one on one"]
  attendeesInclude: [Mike]
  topicKeywords: [career, sales ops]
color: "#dc2626"
status: active
updated: 2026-06-16
---

# Mike / Jordan 1:1 - Rolling Notes

## Current State (as of 06/16)

**Time-spent breakdown (due 6/22)** is the headline ask.

---

## Meeting Log

### 06/16 - Weekly Check-in
- Short call; both pulled elsewhere.
- Source: [[2026-06-16 - Mike 1on1 (Time-Spent Breakdown)]]

### 06/09 - RGA Demo
- Demoed the live RGA intake system.
- Source: [[2026-06-09 - Mike 1on1 (RGA & Doc Request System)]]
`;

describe("parseSeriesDoc", () => {
  const s = parseSeriesDoc(SAMPLE, "300 Merit/Meetings/_Series/mike-1on1.md");
  it("reads frontmatter incl. nested matchRules", () => {
    expect(s.id).toBe("mike-1on1");
    expect(s.name).toBe("Mike / Jordan 1:1");
    expect(s.participants).toEqual(["Jordan Francis", "Mike"]);
    expect(s.matchRules.titleContains).toEqual(["mike"]);
    expect(s.matchRules.attendeesInclude).toEqual(["Mike"]);
  });
  it("extracts Current State and the log entries", () => {
    expect(s.currentState).toContain("Time-spent breakdown");
    expect(s.log).toHaveLength(2);
    expect(s.log[0].heading).toBe("06/16 - Weekly Check-in");
    expect(s.log[1].heading).toBe("06/09 - RGA Demo");
  });
});

describe("matchesSeries", () => {
  const s = parseSeriesDoc(SAMPLE, "x.md");
  it("matches on a clear title signal", () => {
    expect(
      matchesSeries(s, {
        title: "Mike 1on1 (Time-Spent Breakdown)",
        attendees: ["Jordan Francis", "Mike"],
      }),
    ).toBe(true);
  });
  it("matches attendee-only when the set is just the participants", () => {
    expect(
      matchesSeries(s, {
        title: "Weekly sync",
        attendees: ["Jordan Francis", "Mike"],
      }),
    ).toBe(true);
  });
  it("rejects a group meeting that merely includes the person", () => {
    expect(
      matchesSeries(s, {
        title: "Quality program review",
        attendees: ["Jordan Francis", "Mike", "Scott", "Ben", "Ronda"],
      }),
    ).toBe(false);
  });
});

describe("applyMeetingToSeries", () => {
  const s = parseSeriesDoc(SAMPLE, "x.md");
  const out = applyMeetingToSeries(
    s,
    {
      date: "2026-06-23",
      title: "Time-Spend Review",
      bullets: ["Delivered the breakdown", "Next touchpoint 6/30"],
      meetingBasename: "2026-06-23 - Mike 1on1 (Time-Spend Review)",
    },
    "**Breakdown delivered.** Next: 6/30 review.",
    "06/23",
  );

  it("prepends the new log entry (em-dash heading) above existing ones", () => {
    const newIdx = out.indexOf("### 06/23 — Time-Spend Review");
    const oldIdx = out.indexOf("### 06/16 - Weekly Check-in");
    expect(newIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeLessThan(oldIdx);
    expect(out).toContain(
      "- Source: [[2026-06-23 - Mike 1on1 (Time-Spend Review)]]",
    );
    // Existing entry is preserved byte-for-byte.
    expect(out).toContain("### 06/09 - RGA Demo");
  });
  it("rewrites Current State and stamps updated, preserving frontmatter", () => {
    expect(out).toContain("## Current State (as of 06/23)");
    expect(out).toContain("**Breakdown delivered.**");
    expect(out).not.toContain("Time-spent breakdown (due 6/22)");
    expect(out).toContain("updated: 2026-06-23");
    expect(out).toContain("titleContains: [mike]"); // frontmatter untouched
  });
});

// A doc in Jordan's real vault shape: type "Rolling Series", `series` name,
// participants, no matchRules. The parser must derive matchRules from these.
const REAL = `---
type: Rolling Series
series: Mike / Jordan 1:1
cadence: Weekly (Tuesdays)
participants: [Jordan Francis, Mike]
tags: [career, sales-ops]
workstream: merit
status: active
created: 2026-05-12
updated: 2026-06-16
---

# Mike / Jordan 1:1 — Rolling Notes

## Current State (as of 06/16)

Headline ask in flight.

## Meeting Log

### 06/16 — Weekly Check-in
- A bullet.
- Source: [[2026-06-16 - Mike 1on1]]
`;

describe("parseSeriesDoc (real vault shape, derived matchRules)", () => {
  const s = parseSeriesDoc(REAL, "300 Merit/Meetings/Internal/Rolling/Mike 1on1.md");
  it("uses the series field as the name", () => {
    expect(s.name).toBe("Mike / Jordan 1:1");
  });
  it("derives matchRules from participants and the 1:1 name", () => {
    expect(s.matchRules.attendeesInclude).toEqual(["Mike"]);
    expect(s.matchRules.titleContains).toEqual(["mike"]);
    expect(s.matchRules.titleAlsoContains).toContain("1on1");
  });
  it("matches the recurring meeting via the derived rules", () => {
    expect(
      matchesSeries(s, {
        title: "Mike 1on1 (Time-Spent Breakdown)",
        attendees: ["Jordan Francis", "Mike"],
      }),
    ).toBe(true);
  });
});

describe("mmdd", () => {
  it("formats ISO dates as MM/DD", () => {
    expect(mmdd("2026-06-23")).toBe("06/23");
  });
});
