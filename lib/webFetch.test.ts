import { describe, expect, it } from "vitest";
import { htmlToText, isSafeExternalUrl } from "./webFetch";

describe("isSafeExternalUrl", () => {
  it("allows public https and http sites", () => {
    expect(isSafeExternalUrl("https://www.merit.com/products").ok).toBe(true);
    expect(isSafeExternalUrl("http://example.com/spec.pdf").ok).toBe(true);
  });

  it("refuses non-http protocols", () => {
    expect(isSafeExternalUrl("file:///etc/passwd").ok).toBe(false);
    expect(isSafeExternalUrl("ftp://host/file").ok).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("refuses local and internal hosts", () => {
    expect(isSafeExternalUrl("http://localhost:3000/").ok).toBe(false);
    expect(isSafeExternalUrl("http://app.local/").ok).toBe(false);
    expect(isSafeExternalUrl("http://service.internal/x").ok).toBe(false);
  });

  it("refuses IP literal hosts (private ranges included)", () => {
    expect(isSafeExternalUrl("http://127.0.0.1/").ok).toBe(false);
    expect(isSafeExternalUrl("http://10.0.0.5/admin").ok).toBe(false);
    expect(isSafeExternalUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(isSafeExternalUrl("http://[::1]/").ok).toBe(false);
  });

  it("refuses garbage", () => {
    expect(isSafeExternalUrl("not a url").ok).toBe(false);
  });
});

describe("htmlToText", () => {
  it("strips tags, scripts, and styles into readable text", () => {
    const html = `<html><head><title>x</title><style>p{color:red}</style></head>
      <body><script>evil()</script><h1>Catalog</h1>
      <p>Part <b>K12-1097</b> available.</p>
      <ul><li>50 units</li><li>USD 12.40</li></ul></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Catalog");
    expect(text).toContain("Part K12-1097 available.");
    expect(text).toContain("- 50 units");
    expect(text).not.toContain("evil");
    expect(text).not.toContain("color:red");
  });

  it("decodes common entities and collapses whitespace", () => {
    expect(htmlToText("A&amp;B&nbsp;&nbsp;C   D")).toBe("A&B C D");
  });
});
