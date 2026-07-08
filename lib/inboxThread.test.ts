import { describe, expect, it } from "vitest";
import { htmlQuoteCut } from "./inboxThread";

const OWN = `<div>${"x".repeat(300)}<p>Hello Davis, please see the pricing.</p></div>`;

describe("htmlQuoteCut", () => {
  it("cuts at Outlook's divRplyFwdMsg separator", () => {
    const html = `${OWN}<div id="divRplyFwdMsg"><b>From:</b> Davis Ruiz</div>`;
    const cut = htmlQuoteCut(html);
    expect(cut).not.toBeNull();
    expect(html.slice(0, cut!)).toContain("see the pricing");
    expect(html.slice(0, cut!)).not.toContain("divRplyFwdMsg");
  });

  it("cuts at desktop Outlook's border-top + From header", () => {
    const html = `${OWN}<div style="border:none;border-top:solid #E1E1E1 1.0pt"><p><b>From:</b> Yessennia Perry</p></div>`;
    const cut = htmlQuoteCut(html);
    expect(cut).not.toBeNull();
    expect(html.slice(0, cut!)).not.toContain("border-top:solid");
  });

  it("cuts at a Gmail quote block", () => {
    const html = `${OWN}<div class="gmail_quote">On Jul 8, Davis wrote:</div>`;
    const cut = htmlQuoteCut(html);
    expect(cut).not.toBeNull();
    expect(html.slice(0, cut!)).not.toContain("gmail_quote");
  });

  it("cuts at a blockquote", () => {
    const html = `${OWN}<blockquote>older mail</blockquote>`;
    const cut = htmlQuoteCut(html);
    expect(cut).not.toBeNull();
    expect(html.slice(0, cut!)).not.toContain("blockquote");
  });

  it("returns null when there is no quoted history", () => {
    expect(htmlQuoteCut(OWN)).toBeNull();
  });

  it("ignores a boundary at the very top (whole message is a forward)", () => {
    const html = `<blockquote>forwarded content only</blockquote>`;
    expect(htmlQuoteCut(html)).toBeNull();
  });

  it("picks the earliest boundary when several exist", () => {
    const html = `${OWN}<div class="gmail_quote">quote</div><blockquote>even older</blockquote>`;
    const cut = htmlQuoteCut(html)!;
    expect(html.slice(0, cut)).not.toContain("gmail_quote");
  });
});
