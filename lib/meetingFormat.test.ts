import { describe, it, expect } from "vitest";
import {
  sanitizeForFilename,
  meetingBasename,
  meetingFolder,
  renderMeetingNote,
  upsertMeetingsIndex,
  rebuildMeetingsIndex,
  indexRowFromPath,
} from "./meetingFormat";
import type { TriagedMeeting } from "./ai";

const baseTriage: TriagedMeeting = {
  modelUsed: "claude-sonnet-5",
  workstream: "merit",
  account: "MicroVention Terumo",
  bucket: "Terumo",
  series: "Terumo / Merit PCN Recurring",
  title: "GTIN Alignment",
  topic: "Sample build, GTIN implementation",
  tldr: "Merit cannot build samples without a valid GTIN from Terumo.",
  actionItems: [
    {
      owner: "Zoya",
      text: "Follow up on internal part number",
      isJordans: false,
      due: "Next week",
    },
    {
      owner: "Jordan",
      text: "Send updated validation memos to Terumo",
      isJordans: true,
      priority: "high",
      due: "2026-06-20",
    },
  ],
  decisions: ["Biweekly cadence locked", "Bridge inventory pursued"],
  numbers: ["1.5-year validation timeline", "Supply gap by April 2027"],
  watchouts: ["HPF tubing validation data is severely limited"],
  fullNotes: [
    { subsection: "GTIN Constraint", text: "Merit needs a valid GS1 barcode." },
    { subsection: "Bridge Inventory", text: "Secure inventory in parallel." },
  ],
};

describe("sanitizeForFilename", () => {
  it("strips characters illegal in filenames and wikilinks", () => {
    expect(sanitizeForFilename('Q3: Plan / [Draft] "v2"')).toBe(
      "Q3 Plan Draft v2",
    );
  });
});

describe("meetingBasename", () => {
  it("prefixes the date and cleans the title", () => {
    expect(meetingBasename("2026-05-28", "GTIN Alignment")).toBe(
      "2026-05-28 - GTIN Alignment",
    );
  });
});

describe("meetingFolder", () => {
  it("files merit customer meetings under the account", () => {
    expect(meetingFolder("merit", "MicroVention Terumo")).toBe(
      "300 Merit/Meetings/MicroVention Terumo",
    );
  });
  it("routes internal merit meetings to Internal, ambiguous ones to _Unfiled", () => {
    expect(meetingFolder("merit", null, "Internal")).toBe(
      "300 Merit/Meetings/Internal",
    );
    expect(meetingFolder("merit", null, "Stryker")).toBe(
      "300 Merit/Meetings/_Unfiled",
    );
  });
  it("routes other workstreams to their own Meetings folders", () => {
    expect(meetingFolder("sloan", "Acme")).toBe("500 Sloan/Meetings/Acme");
    expect(meetingFolder("personal", null)).toBe("600 Personal/Meetings");
  });
});

describe("indexRowFromPath", () => {
  it("parses a dated meeting note into a row with the folder as bucket", () => {
    expect(
      indexRowFromPath("300 Merit/Meetings/Stryker/2026-06-16 - Dash 9F MDR.md"),
    ).toEqual({
      date: "2026-06-16",
      bucket: "Stryker",
      title: "Dash 9F MDR",
      basename: "2026-06-16 - Dash 9F MDR",
    });
  });
  it("buckets Internal and _Unfiled folders", () => {
    expect(
      indexRowFromPath("300 Merit/Meetings/Internal/2026-06-16 - Mike 1on1.md")
        ?.bucket,
    ).toBe("Internal");
    expect(
      indexRowFromPath("300 Merit/Meetings/_Unfiled/2026-06-16 - X.md")?.bucket,
    ).toBe("Unfiled");
  });
  it("ignores non-dated working files", () => {
    expect(indexRowFromPath("300 Merit/Meetings/Stryker/Amplitude.md")).toBeNull();
  });
});

describe("rebuildMeetingsIndex", () => {
  const index = [
    "# Meetings Index",
    "",
    "## Recent meetings",
    "",
    "| Date | Bucket | Title | Note |",
    "|------|--------|-------|------|",
    "| 2026-06-10 | Stryker | Stale Old | [[2026-06-10 - Stale Old]] |",
    "",
    "trailing prose",
  ].join("\n");

  it("replaces the table from the file set, newest first", () => {
    const out = rebuildMeetingsIndex(index, [
      {
        date: "2026-06-16",
        bucket: "Internal",
        title: "Mike 1on1",
        basename: "2026-06-16 - Mike 1on1",
      },
      {
        date: "2026-06-12",
        bucket: "Stryker",
        title: "LTA",
        basename: "2026-06-12 - LTA",
      },
    ]);
    const rows = out.split("\n").filter((l) => l.startsWith("| 2026-"));
    expect(rows[0]).toContain("2026-06-16 - Mike 1on1");
    expect(rows[1]).toContain("2026-06-12 - LTA");
    // The stale row that has no backing file is dropped on rebuild.
    expect(out).not.toContain("Stale Old");
    expect(out).toContain("trailing prose");
  });
});

describe("renderMeetingNote", () => {
  const md = renderMeetingNote({
    triaged: baseTriage,
    date: "2026-05-28",
    meetingTime: "2:30 PM MDT",
    attendees: ["Jordan Francis", "Zoya", "Ben Skousen"],
    granolaId: "not_1d3tmYTlCICgjy",
    webUrl: "https://granola.ai/notes/not_1d3tmYTlCICgjy",
    createdISO: "2026-06-17",
  });

  it("writes the meeting frontmatter to match the vault", () => {
    expect(md).toContain("workstream: merit");
    expect(md).toContain("type: meeting");
    expect(md).toContain("date: 2026-05-28");
    expect(md).toContain('customer: "[[MicroVention Terumo]]"');
    expect(md).toContain("series: Terumo / Merit PCN Recurring");
    expect(md).toContain("granola_id: not_1d3tmYTlCICgjy");
    expect(md).toContain("attendees: [Jordan Francis, Zoya, Ben Skousen]");
    // topic lives on the Bucket line, not in frontmatter.
    expect(md).not.toContain("topic:");
  });

  it("renders the title and Bucket line in Jordan's style", () => {
    expect(md).toContain("# GTIN Alignment -- MicroVention Terumo");
    expect(md).toContain(
      "**Bucket:** Terumo · Sample build, GTIN implementation",
    );
  });

  it("renders the canonical sections in order", () => {
    const order = [
      "## TL;DR",
      "## Action Items",
      "## Key Decisions",
      "## Numbers That Matter",
      "## Watch-Outs",
      "## Full Notes",
    ];
    const positions = order.map((h) => md.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
    expect(md).toContain("### GTIN Constraint");
  });

  it("field-rows Jordan's items (real tasks) and tracks others with a Due line", () => {
    expect(md).toContain("- [ ] Zoya: Follow up on internal part number");
    expect(md).toContain("    🗓️ Due: Next week");
    expect(md).toContain("- [ ] Jordan: Send updated validation memos to Terumo");
    expect(md).toContain("[created:: 2026-05-28]");
    expect(md).toContain("[due:: 2026-06-20]");
    expect(md).toContain("[customer:: [[MicroVention Terumo]]]");
  });

  it("omits optional sections when empty", () => {
    const sparse = renderMeetingNote({
      triaged: {
        ...baseTriage,
        decisions: [],
        numbers: [],
        watchouts: [],
        fullNotes: [],
      },
      date: "2026-05-28",
      meetingTime: null,
      attendees: ["Jordan Francis"],
      granolaId: "not_x",
      createdISO: "2026-06-17",
    });
    expect(sparse).toContain("## TL;DR");
    expect(sparse).toContain("## Action Items");
    expect(sparse).not.toContain("## Key Decisions");
    expect(sparse).not.toContain("## Numbers That Matter");
    expect(sparse).not.toContain("## Full Notes");
  });

  it("never emits em dashes (house style)", () => {
    expect(md).not.toContain("—");
  });
});

describe("upsertMeetingsIndex", () => {
  const index = [
    "# Meetings Index",
    "",
    "**Last update:** 2026-06-16 old",
    "",
    "## Recent meetings",
    "",
    "| Date | Bucket | Title | Note |",
    "|------|--------|-------|------|",
    "| 2026-06-10 | Stryker | Old Meeting | [[2026-06-10 - Old Meeting]] |",
    "",
    "Some trailing prose.",
  ].join("\n");

  it("inserts a new row newest-first and refreshes the stamp", () => {
    const out = upsertMeetingsIndex(
      index,
      [
        {
          date: "2026-06-15",
          bucket: "Terumo",
          title: "GTIN Alignment",
          basename: "2026-06-15 - GTIN Alignment",
        },
      ],
      "2026-06-17 (app Granola pull: 1 new)",
    );
    const lines = out.split("\n");
    const dataRows = lines.filter((l) => l.startsWith("| 2026-"));
    expect(dataRows[0]).toContain("2026-06-15 - GTIN Alignment");
    expect(dataRows[1]).toContain("2026-06-10 - Old Meeting");
    expect(out).toContain("**Last update:** 2026-06-17 (app Granola pull: 1 new)");
    expect(out).toContain("Some trailing prose.");
  });

  it("dedupes by basename and preserves prose", () => {
    const out = upsertMeetingsIndex(index, [
      {
        date: "2026-06-10",
        bucket: "Stryker",
        title: "Old Meeting",
        basename: "2026-06-10 - Old Meeting",
      },
    ]);
    const count = out
      .split("\n")
      .filter((l) => l.includes("2026-06-10 - Old Meeting")).length;
    expect(count).toBe(1);
  });
});
