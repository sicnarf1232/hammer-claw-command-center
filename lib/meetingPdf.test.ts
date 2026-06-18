import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildMeetingPdf } from "./meetingPdf";
import type { ShareDoc } from "./meetingShare";

function header(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(0, 5));
}

describe("buildMeetingPdf", () => {
  it("produces a valid PDF and survives emoji / em dashes / unicode", async () => {
    const doc: ShareDoc = {
      kind: "meeting",
      title: "GTIN Alignment — MicroVention Terumo",
      subtitle: "2026-06-17",
      meta: [
        { label: "Account", value: "MicroVention Terumo" },
        { label: "Attendees", value: "Jordan, Zoya, José" },
      ],
      blocks: [
        { type: "tldr", label: "TL;DR", text: "Merit cannot build samples without a valid GTIN." },
        {
          type: "actions",
          items: [
            { done: false, owner: "Zoya", text: "Follow up 🗓️ on the part number", due: "Next week", flag: true },
            { done: true, owner: "Jordan", text: "Send memos", due: "2026-06-24", flag: false },
          ],
        },
        { type: "bullets", heading: "Key Decisions", items: ["Hold builds until GTIN is confirmed."] },
        { type: "prose", heading: "Full Notes", text: "### Background\n\nLong “discussion” about systems…" },
      ],
      filenameBase: "2026-06-17 - GTIN Alignment",
    };

    const bytes = await buildMeetingPdf(doc);
    expect(header(bytes)).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(800);
  });

  it("paginates long content across multiple pages", async () => {
    const items = Array.from({ length: 120 }, (_, i) => `Decision number ${i + 1} that matters a great deal`);
    const doc: ShareDoc = {
      kind: "meeting",
      title: "Very long meeting",
      meta: [],
      blocks: [{ type: "bullets", heading: "Key Decisions", items }],
      filenameBase: "long",
    };
    const bytes = await buildMeetingPdf(doc);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
  });
});
