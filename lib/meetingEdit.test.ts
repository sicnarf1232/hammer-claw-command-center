import { describe, it, expect } from "vitest";
import {
  applyMeetingEdit,
  meetingNoteToEditable,
  serializeActionItems,
  setMeetingCustomer,
  type MeetingEdit,
} from "./meetingEdit";
import { parseMeetingNote } from "./vault/meetings";

describe("setMeetingCustomer", () => {
  const base = `---\ntype: meeting\nattendees: [Jordan Francis, Nick Francis]\ncustomer: "[[Stryker]]"\n---\n\n# A meeting\n\n## TL;DR\nbody stays.\n`;

  it("replaces an existing customer link, body untouched", () => {
    const out = setMeetingCustomer(base, "Intuitive Surgical");
    expect(out).toContain('customer: "[[Intuitive Surgical]]"');
    expect(out).not.toContain("[[Stryker]]");
    expect(out).toContain("body stays.");
    expect(parseMeetingNote(out).customer?.basename).toBe("Intuitive Surgical");
  });

  it("clears the link when account is null (mark internal)", () => {
    const out = setMeetingCustomer(base, null);
    expect(out).not.toMatch(/^customer\s*:/m);
    expect(parseMeetingNote(out).customer).toBeUndefined();
    expect(out).toContain("body stays.");
  });

  it("adds a customer line after attendees when none exists", () => {
    const noCust = `---\ntype: meeting\nattendees: [Jordan Francis]\n---\n\n# A meeting\n`;
    const out = setMeetingCustomer(noCust, "Stryker");
    expect(out).toContain('customer: "[[Stryker]]"');
    expect(parseMeetingNote(out).customer?.basename).toBe("Stryker");
  });

  it("is a no-op without frontmatter", () => {
    expect(setMeetingCustomer("# no fm\n", "Stryker")).toBe("# no fm\n");
  });
});

// A realistic canonical note (Granola-pull / Meeting Notes App Handoff shape).
const NOTE = `---
workstream: merit
type: meeting
status: active
created: 2026-06-17
date: 2026-06-17
meeting_time: 2:30 PM MDT
customer: "[[MicroVention Terumo]]"
attendees: [Jordan, Zoya, Nick]
series: Terumo / Merit PCN Recurring
granola_id: not_abc123
---

# GTIN Alignment -- MicroVention Terumo

**Customer:** [[MicroVention Terumo]] · **Date:** 2026-06-17 · **Time:** 2:30 PM MDT
**Bucket:** Terumo · Sample build, GTIN implementation

## TL;DR

Merit cannot build samples without a valid GTIN from Terumo.

## Action Items

- [ ] Zoya: Follow up on internal part number
    🗓️ Due: Next week (confirm)
- [ ] Jordan: Send updated validation memos to Terumo
    [customer:: [[MicroVention Terumo]]] [created:: 2026-06-17] [priority:: high] [due:: TBD]

## Key Decisions

- Hold sample builds until GTIN is confirmed.

## Numbers That Matter

- 12 SKUs pending.

## Watch-Outs

- Terumo holiday closure next week.

## Full Notes

### Background

Long discussion about the GTIN system.
`;

function editableFrom(content: string): MeetingEdit {
  return meetingNoteToEditable(parseMeetingNote(content, "x.md"));
}

describe("meetingNoteToEditable", () => {
  it("strips the account suffix from the title", () => {
    const e = editableFrom(NOTE);
    expect(e.title).toBe("GTIN Alignment");
    expect(e.account).toBe("MicroVention Terumo");
  });

  it("captures topic, attendees, and section bodies", () => {
    const e = editableFrom(NOTE);
    // The parser models the whole Bucket line value as `topic`.
    expect(e.topic).toBe("Terumo · Sample build, GTIN implementation");
    expect(e.attendees).toEqual(["Jordan", "Zoya", "Nick"]);
    expect(e.sections["TL;DR"]).toContain("valid GTIN");
    expect(e.sections["Key Decisions"]).toContain("Hold sample builds");
  });

  it("maps action items, preserving Jordan's fields and the TBD flag", () => {
    const e = editableFrom(NOTE);
    const jordan = e.actionItems.find((a) => a.isJordans)!;
    expect(jordan.owner).toBe("Jordan");
    expect(jordan.due).toBe("TBD");
    expect(jordan.priority).toBe("high");
    expect(jordan.customer).toBe("MicroVention Terumo");
    expect(jordan.created).toBe("2026-06-17");

    const zoya = e.actionItems.find((a) => !a.isJordans)!;
    expect(zoya.due).toBe("Next week"); // "(confirm)" stripped
  });
});

describe("applyMeetingEdit — round trip and edits", () => {
  it("is stable: editing nothing reproduces an equivalent note", () => {
    const e = editableFrom(NOTE);
    const out = applyMeetingEdit(NOTE, e);
    const reparsed = parseMeetingNote(out, "x.md");
    expect(reparsed.title).toBe("GTIN Alignment -- MicroVention Terumo");
    expect(reparsed.attendees).toEqual(["Jordan", "Zoya", "Nick"]);
    expect(reparsed.sections["TL;DR"]).toContain("valid GTIN");
    expect(reparsed.actionItems).toHaveLength(2);
  });

  it("clears a Phase-A TBD flag by setting a real due date", () => {
    const e = editableFrom(NOTE);
    const jordan = e.actionItems.find((a) => a.isJordans)!;
    jordan.due = "2026-06-24";
    const out = applyMeetingEdit(NOTE, e);
    expect(out).toContain("[due:: 2026-06-24]");
    expect(out).not.toContain("[due:: TBD]");
    // Other inline fields are preserved.
    expect(out).toContain("[priority:: high]");
    expect(out).toContain("[customer:: [[MicroVention Terumo]]]");
  });

  it("an emptied Jordan due falls back to TBD (stays a flag)", () => {
    const e = editableFrom(NOTE);
    e.actionItems.find((a) => a.isJordans)!.due = "";
    expect(applyMeetingEdit(NOTE, e)).toContain("[due:: TBD]");
  });

  it("reassigns attendees in frontmatter", () => {
    const e = editableFrom(NOTE);
    e.attendees = ["Jordan", "Mike"];
    const out = applyMeetingEdit(NOTE, e);
    expect(out).toContain("attendees: [Jordan, Mike]");
    expect(parseMeetingNote(out, "x.md").attendees).toEqual(["Jordan", "Mike"]);
  });

  it("changes the account across frontmatter, title, and meta line", () => {
    const e = editableFrom(NOTE);
    e.account = "Acme Cardio";
    const out = applyMeetingEdit(NOTE, e);
    expect(out).toContain(`customer: "[[Acme Cardio]]"`);
    expect(out).toContain("# GTIN Alignment -- Acme Cardio");
    expect(out).toContain("**Customer:** [[Acme Cardio]]");
    expect(out).toContain("**Date:** 2026-06-17"); // date segment preserved
  });

  it("clears the account from frontmatter, title, and meta line", () => {
    const e = editableFrom(NOTE);
    e.account = null;
    const out = applyMeetingEdit(NOTE, e);
    expect(out).not.toMatch(/^customer:/m); // frontmatter line gone
    expect(out).toContain("# GTIN Alignment\n");
    expect(out).not.toContain("**Customer:**");
    expect(out).toContain("**Date:** 2026-06-17");
  });

  it("edits the bucket/topic line", () => {
    const e = editableFrom(NOTE);
    e.topic = "Terumo · New topic detail";
    const out = applyMeetingEdit(NOTE, e);
    expect(out).toContain("**Bucket:** Terumo · New topic detail");
  });

  it("drops an optional section when its body is emptied", () => {
    const e = editableFrom(NOTE);
    e.sections["Watch-Outs"] = "";
    const out = applyMeetingEdit(NOTE, e);
    expect(out).not.toContain("## Watch-Outs");
    expect(out).toContain("## Key Decisions");
  });

  it("preserves a non-canonical section verbatim", () => {
    const withExtra = NOTE + "\n## Parking Lot\n\n- revisit pricing\n";
    const e = editableFrom(withExtra);
    const out = applyMeetingEdit(withExtra, e);
    expect(out).toContain("## Parking Lot");
    expect(out).toContain("- revisit pricing");
  });

  it("preserves unmanaged frontmatter fields", () => {
    const e = editableFrom(NOTE);
    e.attendees = ["Jordan"];
    const out = applyMeetingEdit(NOTE, e);
    expect(out).toContain("granola_id: not_abc123");
    expect(out).toContain("series: Terumo / Merit PCN Recurring");
    expect(out).toContain("meeting_time: 2:30 PM MDT");
  });
});

describe("serializeActionItems", () => {
  it("renders Jordan's items with the inline field row and others tracking-only", () => {
    const md = serializeActionItems([
      {
        done: false,
        isJordans: true,
        owner: "Jordan",
        text: "Ship it",
        due: "2026-07-01",
        priority: "med",
        created: "2026-06-17",
      },
      { done: true, isJordans: false, owner: "Sam", text: "Send specs", due: "" },
    ]);
    expect(md).toContain("- [ ] Jordan: Ship it");
    expect(md).toContain("[due:: 2026-07-01]");
    expect(md).toContain("- [x] Sam: Send specs");
    expect(md).not.toContain("🗓️ Due:"); // Sam has no due
  });

  it("emits a placeholder when empty", () => {
    expect(serializeActionItems([])).toBe("- (none captured)");
  });
});
