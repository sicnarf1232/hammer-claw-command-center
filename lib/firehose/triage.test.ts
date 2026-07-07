import { describe, expect, it } from "vitest";
import { manualTriageUpdates, type ManualTriagePrev } from "./triage";

const NOW = new Date("2026-07-06T12:00:00Z");

const aiRow: ManualTriagePrev = {
  summary: "Customer asked for lead time on 7F sheaths.",
  pathway: "needs-reply",
  priority: "high",
  needsReply: true,
  model: "claude-sonnet-5",
  aiGenerated: true,
  aiSnapshot: null,
};

describe("manualTriageUpdates", () => {
  it("flips aiGenerated off and latches manual on any touch", () => {
    const u = manualTriageUpdates({ reviewed: true }, aiRow, NOW);
    expect(u.manual).toBe(true);
    expect(u.aiGenerated).toBe(false);
    expect(u.reviewed).toBe(true);
    expect(u.reviewedAt).toEqual(NOW);
  });

  it("freezes the AI values into aiSnapshot on first correction", () => {
    const u = manualTriageUpdates({ pathway: "logistics" }, aiRow, NOW);
    expect(u.pathway).toBe("logistics");
    expect(u.needsReply).toBe(false); // derived from pathway
    expect(u.aiSnapshot).toEqual({
      summary: aiRow.summary,
      pathway: "needs-reply",
      priority: "high",
      needsReply: true,
      model: "claude-sonnet-5",
    });
  });

  it("does not overwrite an existing snapshot on later edits", () => {
    const corrected: ManualTriagePrev = {
      ...aiRow,
      aiGenerated: false,
      pathway: "logistics",
      aiSnapshot: { summary: "s", pathway: "needs-reply", priority: "high", needsReply: true, model: "m" },
    };
    const u = manualTriageUpdates({ pathway: "fyi" }, corrected, NOW);
    expect(u.aiSnapshot).toBeUndefined();
  });

  it("does not snapshot when there was no prior row", () => {
    const u = manualTriageUpdates({ pathway: "noise" }, null, NOW);
    expect(u.aiSnapshot).toBeUndefined();
    expect(u.pathway).toBe("noise");
  });

  it("explicit needsReply overrides the pathway derivation", () => {
    const u = manualTriageUpdates({ pathway: "quote-request", needsReply: true }, aiRow, NOW);
    expect(u.pathway).toBe("quote-request");
    expect(u.needsReply).toBe(true);
  });

  it("un-reviewing clears reviewedAt", () => {
    const u = manualTriageUpdates({ reviewed: false }, aiRow, NOW);
    expect(u.reviewed).toBe(false);
    expect(u.reviewedAt).toBeNull();
  });
});
