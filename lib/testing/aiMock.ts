// Typed factories for AI results, for tests that exercise orchestration code
// with vi.mock("@/lib/ai"). Keeps fixtures honest against the real types: a
// field added to an AI result type breaks compilation here, not silently in
// tests. Not imported by production code.

import type {
  EmailTriageResult,
  TriagedMeeting,
  SeriesUpdate,
} from "@/lib/ai";

export function fakeEmailTriage(
  overrides: Partial<EmailTriageResult> = {},
): EmailTriageResult {
  return {
    summary: "Customer asked for lead time on the 7F sheath order.",
    pathway: "needs-reply",
    priority: "medium",
    needsReply: true,
    modelUsed: "claude-sonnet-5",
    ...overrides,
  };
}

export function fakeTriagedMeeting(
  overrides: Partial<TriagedMeeting> = {},
): TriagedMeeting {
  return {
    workstream: "merit",
    account: "MicroVention Terumo",
    bucket: "Terumo",
    series: null,
    attendees: [],
    title: "GTIN Alignment",
    topic: "Sample build, GTIN implementation",
    tldr: "Merit cannot build samples without a valid GTIN from Terumo.",
    actionItems: [],
    decisions: [],
    numbers: [],
    watchouts: [],
    fullNotes: [],
    modelUsed: "claude-sonnet-5",
    ...overrides,
  };
}

export function fakeSeriesUpdate(
  overrides: Partial<SeriesUpdate> = {},
): SeriesUpdate {
  return {
    logBullets: ["GTIN blocker escalated to Terumo regulatory."],
    currentState: "**Status:** waiting on Terumo GTIN.",
    modelUsed: "claude-sonnet-5",
    ...overrides,
  };
}
