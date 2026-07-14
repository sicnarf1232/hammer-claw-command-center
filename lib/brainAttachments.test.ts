import { describe, expect, it } from "vitest";
import {
  attachmentKind,
  attachmentMarker,
  checkAttachmentCount,
  formatBytes,
  MAX_ATTACHMENT_BYTES,
  parseAttachmentRef,
  trimAttachmentHistory,
  validateAttachment,
  type AttachmentRef,
} from "./brainAttachments";

const BLOB_URL = "https://abc123.private.blob.vercel-storage.com/brain/quote-x.pdf";

function ref(over: Partial<AttachmentRef> = {}): AttachmentRef {
  return {
    name: "quote.pdf",
    url: BLOB_URL,
    mime: "application/pdf",
    size: 1234,
    kind: "pdf",
    ...over,
  };
}

describe("attachmentKind", () => {
  it("classifies the accepted image types", () => {
    expect(attachmentKind("image/png", "a.png")).toBe("image");
    expect(attachmentKind("image/jpeg", "a.jpg")).toBe("image");
    expect(attachmentKind("image/gif", "a.gif")).toBe("image");
    expect(attachmentKind("image/webp", "a.webp")).toBe("image");
  });

  it("classifies PDFs by mime or extension", () => {
    expect(attachmentKind("application/pdf", "spec.pdf")).toBe("pdf");
    expect(attachmentKind("", "spec.PDF")).toBe("pdf");
  });

  it("classifies text-ish files, falling back to the extension", () => {
    expect(attachmentKind("text/plain", "notes.txt")).toBe("text");
    expect(attachmentKind("application/json", "data.json")).toBe("text");
    expect(attachmentKind("", "readme.md")).toBe("text");
    expect(attachmentKind("", "server.log")).toBe("text");
    expect(attachmentKind("", "parts.csv")).toBe("text");
  });

  it("rejects everything else", () => {
    expect(attachmentKind("application/zip", "a.zip")).toBeNull();
    expect(attachmentKind("image/tiff", "scan.tiff")).toBeNull();
    expect(attachmentKind("application/vnd.ms-excel", "book.xls")).toBeNull();
  });
});

describe("validateAttachment", () => {
  it("accepts a normal file and returns its kind", () => {
    const r = validateAttachment({ name: "photo.png", type: "image/png", size: 5000 });
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("image");
  });

  it("rejects unsupported types with a helpful message", () => {
    const r = validateAttachment({ name: "movie.mp4", type: "video/mp4", size: 5000 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("movie.mp4");
  });

  it("rejects files over the 8 MB cap and states the limit", () => {
    const r = validateAttachment({
      name: "big.pdf",
      type: "application/pdf",
      size: MAX_ATTACHMENT_BYTES + 1,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("8 MB");
  });

  it("accepts a file exactly at the cap and rejects empty files", () => {
    expect(
      validateAttachment({ name: "ok.pdf", type: "application/pdf", size: MAX_ATTACHMENT_BYTES }).ok,
    ).toBe(true);
    expect(validateAttachment({ name: "zero.txt", type: "text/plain", size: 0 }).ok).toBe(false);
  });
});

describe("checkAttachmentCount", () => {
  it("allows up to 4 per message", () => {
    expect(checkAttachmentCount(0, 4)).toBeNull();
    expect(checkAttachmentCount(3, 1)).toBeNull();
  });

  it("blocks a fifth file", () => {
    expect(checkAttachmentCount(4, 1)).toContain("4 files");
    expect(checkAttachmentCount(2, 3)).toContain("4 files");
  });
});

describe("parseAttachmentRef", () => {
  it("accepts a valid ref pointing at the blob store", () => {
    const r = parseAttachmentRef(ref());
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("pdf");
    expect(r?.name).toBe("quote.pdf");
  });

  it("refuses refs pointing anywhere else", () => {
    expect(parseAttachmentRef(ref({ url: "https://evil.example.com/x.pdf" }))).toBeNull();
    expect(parseAttachmentRef(ref({ url: "http://abc.blob.vercel-storage.com/x.pdf" }))).toBeNull();
    expect(parseAttachmentRef(ref({ url: "file:///etc/passwd" }))).toBeNull();
    expect(parseAttachmentRef(ref({ url: "not a url" }))).toBeNull();
  });

  it("refuses oversize, empty, or unsupported refs", () => {
    expect(parseAttachmentRef(ref({ size: MAX_ATTACHMENT_BYTES + 1 }))).toBeNull();
    expect(parseAttachmentRef(ref({ size: 0 }))).toBeNull();
    expect(parseAttachmentRef(ref({ name: "a.zip", mime: "application/zip" }))).toBeNull();
    expect(parseAttachmentRef(null)).toBeNull();
    expect(parseAttachmentRef("string")).toBeNull();
    expect(parseAttachmentRef({})).toBeNull();
  });

  it("derives kind from mime and name rather than trusting the client", () => {
    const r = parseAttachmentRef({ ...ref({ mime: "image/png", name: "shot.png" }), kind: "pdf" });
    expect(r?.kind).toBe("image");
  });
});

describe("formatBytes", () => {
  it("formats sizes for chips", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
    expect(formatBytes(0)).toBe("");
  });
});

describe("trimAttachmentHistory", () => {
  const img = ref({ name: "photo.png", mime: "image/png", kind: "image" });

  it("keeps attachments only on the latest user turn", () => {
    const out = trimAttachmentHistory([
      { role: "user", content: "look at this", attachments: [ref()] },
      { role: "assistant", content: "read it" },
      { role: "user", content: "and this one", attachments: [img] },
    ]);
    expect(out[0].attachments).toBeUndefined();
    expect(out[0].content).toBe("[attached: quote.pdf]\nlook at this");
    expect(out[2].attachments).toHaveLength(1);
    expect(out[2].content).toBe("and this one");
  });

  it("marks older attachment-only turns with just the marker", () => {
    const out = trimAttachmentHistory([
      { role: "user", content: "", attachments: [ref(), img] },
      { role: "assistant", content: "summarized" },
      { role: "user", content: "thanks, next question" },
    ]);
    expect(out[0].content).toBe("[attached: quote.pdf, photo.png]");
    expect(out[0].attachments).toBeUndefined();
  });

  it("caps the latest turn at 4 attachments", () => {
    const many = [ref(), img, ref({ name: "b.pdf" }), ref({ name: "c.pdf" }), ref({ name: "d.pdf" })];
    const out = trimAttachmentHistory([
      { role: "user", content: "all of these", attachments: many },
    ]);
    expect(out[0].attachments).toHaveLength(4);
  });

  it("leaves attachment-free history untouched", () => {
    const out = trimAttachmentHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });
});

describe("attachmentMarker", () => {
  it("lists the file names", () => {
    expect(attachmentMarker([{ name: "a.pdf" }, { name: "b.png" }])).toBe(
      "[attached: a.pdf, b.png]",
    );
  });
});
