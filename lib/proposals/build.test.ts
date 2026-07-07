import { describe, expect, it } from "vitest";
import {
  meetingDedupeKey,
  seriesDedupeKey,
  meetingSummaryLine,
  seriesSummaryLine,
  stageAction,
  stableStringify,
} from "./build";
import type { MeetingFilePayload, SeriesUpdatePayload } from "./types";
import { fakeTriagedMeeting } from "@/lib/testing/aiMock";

const meetingPayload: MeetingFilePayload = {
  granolaId: "g-123",
  title: fakeTriagedMeeting().title,
  date: "2026-07-06",
  path: "300 Merit/Customers/Terumo/Meetings/2026-07-06 GTIN Alignment.md",
  content: "# note",
  workstream: "merit",
  bucket: "Terumo",
  account: "MicroVention Terumo",
  attendees: ["Jordan Francis", "Zoya P"],
  tldr: "Blocked on GTIN.",
  contactsToAdd: null,
  seriesName: null,
};

const seriesPayload: SeriesUpdatePayload = {
  seriesPath: "300 Merit/Customers/Terumo/Meetings/Rolling/PCN Recurring.md",
  seriesName: "Terumo / Merit PCN Recurring",
  date: "2026-07-06",
  meetingTitle: "GTIN Alignment",
  meetingBasename: "2026-07-06 GTIN Alignment",
  logBullets: ["Escalated GTIN"],
  currentState: "**Status:** open",
};

describe("dedupe keys", () => {
  it("are stable and source-derived", () => {
    expect(meetingDedupeKey("g-123")).toBe("granola:g-123");
    expect(seriesDedupeKey(seriesPayload.seriesPath, seriesPayload.meetingBasename)).toBe(
      `series:${seriesPayload.seriesPath}:${seriesPayload.meetingBasename}`,
    );
  });
});

describe("summary lines", () => {
  it("describe the write without em dashes", () => {
    const m = meetingSummaryLine(meetingPayload);
    const s = seriesSummaryLine(seriesPayload);
    expect(m).toContain("GTIN Alignment");
    expect(m).toContain("MicroVention Terumo");
    expect(s).toContain("Terumo / Merit PCN Recurring");
    expect(m).not.toContain("—");
    expect(s).not.toContain("—");
  });

  it("falls back to the bucket when there is no account", () => {
    expect(meetingSummaryLine({ ...meetingPayload, account: null, bucket: "Internal" }))
      .toContain("Internal");
  });
});

describe("stageAction", () => {
  it("inserts when nothing exists or the prior attempt errored/expired", () => {
    expect(stageAction(null, true)).toBe("insert");
    expect(stageAction("error", false)).toBe("insert");
    expect(stageAction("expired", false)).toBe("insert");
    expect(stageAction("superseded", false)).toBe("insert");
  });

  it("refreshes a pending proposal only when the payload changed", () => {
    expect(stageAction("pending", true)).toBe("refresh");
    expect(stageAction("pending", false)).toBe("unchanged");
  });

  it("latches decided proposals so re-pulls never resurrect them", () => {
    expect(stageAction("approved", true)).toBe("skip-approved");
    expect(stageAction("rejected", true)).toBe("skip-rejected");
  });
});

describe("stableStringify", () => {
  it("is insensitive to object key order (jsonb round-trips reorder keys)", () => {
    const a = { z: 1, a: { d: [1, 2], b: "x" } };
    const b = { a: { b: "x", d: [1, 2] }, z: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("still distinguishes different values and array order", () => {
    expect(stableStringify({ a: [1, 2] })).not.toBe(stableStringify({ a: [2, 1] }));
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});
