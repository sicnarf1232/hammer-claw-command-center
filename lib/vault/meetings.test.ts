import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMeetingNote, parseMeetingsIndex } from "./meetings";

const fx = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("meeting note parser", () => {
  const note = parseMeetingNote(
    fx("meeting.md"),
    "300 Merit/Meetings/Terumo/2026-05-28 - Terumo PCN Recurring.md",
  );

  it("parses frontmatter into typed fields", () => {
    expect(note.date).toBe("2026-05-28");
    expect(note.customer?.display).toBe("MicroVention Terumo");
    expect(note.series).toBe("Terumo / Merit PCN Recurring");
    expect(note.granolaId).toBe("d1d749cd-99a7-4f72-9e59-4dcbabc15f92");
    expect(note.attendees).toContain("Scott Taylor");
  });

  it("extracts body sections", () => {
    expect(note.sections["TL;DR"]).toContain("Aligned on PCN");
    expect(Object.keys(note.sections)).toContain("Action Items");
  });

  it("dual-captures action items (fixtures 3 and 4)", () => {
    expect(note.actionItems).toHaveLength(3);

    // Fixture 4: other owner, plain, no field row.
    const zoya = note.actionItems[0];
    expect(zoya.isJordans).toBe(false);
    expect(zoya.owner).toBe("Zoya");
    expect(zoya.text).toBe(
      "Follow up on internal part number creation timeline",
    );
    expect(zoya.task).toBeUndefined();

    // Fixture 3: Jordan's, with field row -> real task.
    const jordan = note.actionItems[1];
    expect(jordan.isJordans).toBe(true);
    expect(jordan.owner).toBe("Jordan");
    expect(jordan.task).toBeDefined();
    expect(jordan.task!.priority).toBe("high");
    expect((jordan.task!.customer as { display: string }).display).toBe(
      "MicroVention Terumo",
    );

    // Done Jordan item.
    const jordanDone = note.actionItems[2];
    expect(jordanDone.isJordans).toBe(true);
    expect(jordanDone.done).toBe(true);
    expect(jordanDone.task!.priority).toBe("med");
  });
});

describe("meetings index parser", () => {
  const rows = parseMeetingsIndex(fx("meetings-index.md"));

  it("parses the table and resolves note basenames", () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      date: "2026-06-05",
      bucket: "Stryker",
      title: "TMV Memo & PPAP Alignment",
      noteBasename: "2026-06-05 - TMV Memo & PPAP Alignment",
    });
    expect(rows[1].noteBasename).toBe("2026-05-28 - Terumo PCN Recurring");
  });

  it("skips the header and separator rows", () => {
    expect(rows.every((r) => r.date !== "Date")).toBe(true);
  });
});
