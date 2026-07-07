import { describe, expect, it } from "vitest";
import {
  emailHtmlToText,
  collapseWhitespace,
  splitQuotedHistory,
  formatEmailBody,
} from "./emailFormat";

describe("splitQuotedHistory", () => {
  it("splits at 'On ... wrote:'", () => {
    const { main, quoted } = splitQuotedHistory(
      "Thanks Jordan, the GTIN is confirmed.\n\nOn Mon, Jul 6, 2026 at 9:00 AM Jordan Francis <jordan.francis@merit.com> wrote:\n> Following up on the samples.",
    );
    expect(main).toBe("Thanks Jordan, the GTIN is confirmed.");
    expect(quoted).toContain("wrote:");
    expect(quoted).toContain("Following up");
  });

  it("splits at an Outlook From:/Sent: header block", () => {
    const { main, quoted } = splitQuotedHistory(
      "Approved, proceed.\n\nFrom: Zoya Patel <zoya@acme.com>\nSent: Monday, July 6, 2026\nTo: Jordan Francis\nSubject: RE: Samples",
    );
    expect(main).toBe("Approved, proceed.");
    expect(quoted).toContain("From: Zoya Patel");
  });

  it("splits at '>' quoting", () => {
    const { main, quoted } = splitQuotedHistory("Sounds good.\n\n> earlier message text");
    expect(main).toBe("Sounds good.");
    expect(quoted).toBe("> earlier message text");
  });

  it("keeps everything when the marker is at the top (pure forward)", () => {
    const fwd = "On Mon Jul 6 someone wrote:\nbody of the forward";
    expect(splitQuotedHistory(fwd)).toEqual({
      main: collapseWhitespace(fwd),
      quoted: null,
    });
  });

  it("returns the whole body when there is no quoting", () => {
    expect(splitQuotedHistory("Just a simple note.")).toEqual({
      main: "Just a simple note.",
      quoted: null,
    });
  });
});

describe("emailHtmlToText", () => {
  it("strips tags/styles and decodes entities", () => {
    const text = emailHtmlToText(
      "<style>p{color:red}</style><p>Hi &amp; welcome</p><div>Line&nbsp;two</div>",
    );
    expect(collapseWhitespace(text)).toBe("Hi & welcome\nLine two");
  });
});

describe("formatEmailBody", () => {
  it("prefers text, falls back to html, then preview", () => {
    expect(formatEmailBody({ bodyText: "text wins" }).main).toBe("text wins");
    expect(formatEmailBody({ bodyHtml: "<p>html here</p>" }).main).toBe("html here");
    expect(formatEmailBody({ bodyPreview: "preview" }).main).toBe("preview");
    expect(formatEmailBody({}).main).toBe("");
  });
});
