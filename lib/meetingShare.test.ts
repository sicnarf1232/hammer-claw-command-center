import { describe, it, expect } from "vitest";
import { parseMeetingNote } from "./vault/meetings";
import {
  meetingToShareDoc,
  renderMeetingEmailHtml,
  type ShareDoc,
} from "./meetingShare";

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

Merit cannot build samples without a valid GTIN — Terumo must confirm.

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

function doc(): ShareDoc {
  return meetingToShareDoc(parseMeetingNote(NOTE, "300 Merit/Meetings/Terumo/2026-06-17 - GTIN Alignment.md"));
}

describe("meetingToShareDoc", () => {
  it("builds title, subtitle, meta, and ordered blocks", () => {
    const d = doc();
    expect(d.kind).toBe("meeting");
    expect(d.title).toContain("GTIN Alignment");
    expect(d.subtitle).toBe("2026-06-17");
    expect(d.meta.find((m) => m.label === "Account")?.value).toBe("MicroVention Terumo");
    expect(d.meta.find((m) => m.label === "Attendees")?.value).toBe("Jordan, Zoya");
    const types = d.blocks.map((b) => b.type);
    expect(types).toEqual(["tldr", "actions", "bullets", "prose"]);
    expect(d.filenameBase).toBe("2026-06-17 - GTIN Alignment");
  });

  it("flags the vague due and not the concrete one", () => {
    const actions = doc().blocks.find((b) => b.type === "actions");
    if (actions?.type !== "actions") throw new Error("no actions block");
    const zoya = actions.items.find((i) => i.owner === "Zoya")!;
    const jordan = actions.items.find((i) => i.owner === "Jordan")!;
    expect(zoya.flag).toBe(true); // "Next week" is vague
    expect(jordan.flag).toBe(false); // 2026-06-24 is concrete
    expect(jordan.done).toBe(true);
  });
});

describe("renderMeetingEmailHtml", () => {
  it("produces escaped, em-dash-free HTML with the sections", () => {
    const html = renderMeetingEmailHtml(doc());
    expect(html).not.toContain("—"); // house style
    expect(html).toContain("Film Room");
    expect(html).toContain("Action Items");
    expect(html).toContain("Key Decisions");
    // HTML special chars in the source content are escaped, not injected.
    expect(html).toContain("&lt;discussion&gt;");
    expect(html).toContain("&amp; systems");
    expect(html).toContain("needs due date");
  });
});
