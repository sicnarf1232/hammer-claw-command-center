import { describe, it, expect } from "vitest";
import { parseMeetingNote } from "./vault/meetings";
import { parseSeriesDoc } from "./vault/series";
import {
  meetingToDoc,
  seriesToDoc,
  clean,
  type DocContext,
} from "./meetingTemplate";
import { renderShareHtml } from "./meetingExport";
import type { BrandKit } from "./branding";
import type { SeriesView } from "./vault";

const NOTE = `---
workstream: merit
type: meeting
date: 2026-06-17
customer: "[[MicroVention Terumo]]"
attendees: [Jordan, Zoya]
---

# GTIN Alignment -- MicroVention Terumo

**Bucket:** Terumo · Sample build

## TL;DR

Merit cannot build samples without a valid GTIN, Terumo must confirm.

## Action Items

- [ ] Zoya: Follow up on the part number
    🗓️ Due: Next week (confirm)
- [x] Jordan: Send memos
    [created:: 2026-06-17] [due:: 2026-06-24]

## Key Decisions

- Hold sample builds until GTIN is confirmed.

## Full Notes

### Background

Long <discussion> about "GTIN" & systems.
`;

const MERIT: BrandKit = {
  name: "Merit Medical OEM",
  workstreamKey: "merit",
  primary: "#9f1239",
  secondary: "#4b5563",
  accent: "#e11d48",
  logoUrl: null,
};

const CTX: DocContext = {
  roster: new Map(),
  accounts: [],
  eyebrowLead: "Merit Medical OEM",
};

function meetingDoc() {
  return meetingToDoc(
    parseMeetingNote(NOTE, "300 Merit/Meetings/Terumo/2026-06-17 - GTIN Alignment.md"),
    CTX,
  );
}

describe("clean", () => {
  it("strips em and en dashes to a spaced hyphen", () => {
    expect(clean("A — B")).toBe("A - B");
    expect(clean("A–B")).toBe("A - B");
    expect(clean("plain")).toBe("plain");
  });
});

describe("meetingToDoc", () => {
  it("splits open vs closed actions, flags vague dues, and counts stats", () => {
    const d = meetingDoc();
    expect(d.kind).toBe("meeting");
    expect(d.eyebrow).toBe("Merit Medical OEM · MEETING NOTES");
    expect(d.title).toContain("GTIN Alignment");
    // Zoya is open (and vague-flagged); Jordan's is done -> closed.
    expect(d.openActions).toHaveLength(1);
    expect(d.openActions[0].owner).toBe("Zoya");
    expect(d.openActions[0].flag).toBe(true);
    expect(d.closedActions).toHaveLength(1);
    expect(d.tldr?.label).toBe("TL;DR");
    expect(d.stats.find((s) => s.label === "Decisions")?.value).toBe(1);
  });
});

describe("renderShareHtml", () => {
  it("produces escaped, em-dash-free, brand-themed HTML", () => {
    const html = renderShareHtml(meetingDoc(), MERIT);
    expect(html).not.toContain("—"); // house style
    expect(html).toContain("Merit Medical OEM · MEETING NOTES");
    expect(html).toContain("Action items");
    expect(html).toContain("Key Decisions");
    // Brand vars set on the root, with literal fallbacks for dumb mail clients.
    expect(html).toContain("--brand-primary: #9f1239");
    expect(html).toContain("var(--brand-primary, #9f1239)");
    // Source HTML special chars are escaped, not injected.
    expect(html).toContain("&lt;discussion&gt;");
    expect(html).toContain("&amp; systems");
    expect(html).toContain("needs due date");
  });
});

describe("seriesToDoc + renderShareHtml", () => {
  it("renders a rolling-notes export with stat cards", () => {
    const series = parseSeriesDoc(
      `---\ntype: Rolling Series\ncadence: Weekly\nparticipants: [Jordan, Mike]\n---\n\n# Mike 1on1\n\n## Current State\n\n- Pricing model still open.\n`,
      "300 Merit/Meetings/Internal/Rolling/Mike 1on1.md",
    );
    const view: SeriesView = {
      outstanding: [],
      closed: [{ text: "Sent the deck", date: "2026-06-10" }],
      sessions: [{ heading: "06/10 - Sync", text: "- Talked pricing", notePath: null }],
      stats: {
        attendance: [{ name: "Jordan", count: 3 }, { name: "Mike", count: 3 }],
        sessions: 3,
        actionsOpen: 2,
        actionsClosed: 5,
        decisions: 1,
        latestDate: "2026-06-10",
      },
    };
    const doc = seriesToDoc(series, view, { ...CTX, eyebrowLead: "Merit Medical OEM" });
    expect(doc.eyebrow).toBe("Merit Medical OEM · ROLLING NOTES");
    expect(doc.stats.find((s) => s.label === "Sessions")?.value).toBe(3);
    const html = renderShareHtml(doc, MERIT);
    expect(html).toContain("ROLLING NOTES");
    expect(html).toContain("Sessions");
    expect(html).toContain("1 closed");
    expect(html).not.toContain("—");
  });
});
