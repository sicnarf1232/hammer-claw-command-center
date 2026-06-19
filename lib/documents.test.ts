import { describe, it, expect } from "vitest";
import { matchDocuments, isDocType, docTypeLabel, type DocumentRecord } from "./documents";

function doc(p: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: 1,
    title: "Untitled",
    fileName: "f.pdf",
    contentType: "application/pdf",
    sizeBytes: 1,
    blobUrl: "https://x",
    docType: "other",
    account: null,
    tags: [],
    extractedText: null,
    notes: null,
    uploadedAt: new Date(0),
    ...p,
  };
}

describe("matchDocuments", () => {
  const docs = [
    doc({ id: 1, title: "ISO 13485 Certificate", docType: "iso", account: "Stryker" }),
    doc({ id: 2, title: "Biocomp report", docType: "biocomp", extractedText: "cytotoxicity passing for catheter" }),
    doc({ id: 3, title: "Drawing 4007", docType: "drawing", account: "Terumo" }),
  ];

  it("matches title, account, type, and extracted text", () => {
    expect(matchDocuments("iso certificate for stryker", docs, 5)[0].id).toBe(1);
    expect(matchDocuments("cytotoxicity", docs, 5)[0].id).toBe(2);
    expect(matchDocuments("terumo drawing", docs, 5)[0].id).toBe(3);
  });

  it("returns nothing on no keyword hit and respects the limit", () => {
    expect(matchDocuments("forecast pipeline", docs, 5)).toEqual([]);
    expect(matchDocuments("iso biocomp drawing", docs, 2)).toHaveLength(2);
  });
});

describe("doc type helpers", () => {
  it("validates and labels types", () => {
    expect(isDocType("pcn")).toBe(true);
    expect(isDocType("nope")).toBe(false);
    expect(docTypeLabel("biocomp")).toBe("Biocompatibility");
    expect(docTypeLabel("unknown")).toBe("Other");
  });
});
