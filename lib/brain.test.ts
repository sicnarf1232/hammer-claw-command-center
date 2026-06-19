import { describe, it, expect } from "vitest";
import {
  pickRelevant,
  isPricingQuestion,
  matchCatalog,
  bestSnippet,
} from "./brain";
import type { CatalogItem } from "./priceList";

describe("pickRelevant", () => {
  const texts = [
    "Stryker Weekly Account Sync", // 0
    "Terumo GTIN Alignment", // 1
    "Internal team standup", // 2
    "Stryker pricing review", // 3
  ];

  it("ranks items by question keyword overlap", () => {
    const idx = pickRelevant("What is open for Stryker pricing?", texts, 3);
    // Both Stryker items match; the pricing one matches two keywords, ranks first.
    expect(idx[0]).toBe(3);
    expect(idx).toContain(0);
    expect(idx).not.toContain(1);
  });

  it("ignores stopwords and short tokens", () => {
    // "the", "what", "is", "of" are stopped; nothing meaningful matches.
    expect(pickRelevant("what is the of", texts, 3)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(pickRelevant("Stryker Terumo internal pricing", texts, 2)).toHaveLength(2);
  });

  it("returns nothing when no keywords hit", () => {
    expect(pickRelevant("Medtronic forecast", texts, 3)).toEqual([]);
  });
});

describe("isPricingQuestion", () => {
  it("detects pricing intent and part numbers", () => {
    expect(isPricingQuestion("what is the price of MSS031")).toBe(true);
    expect(isPricingQuestion("how much does the syringe cost")).toBe(true);
    expect(isPricingQuestion("quote for the dash catheter")).toBe(true);
    expect(isPricingQuestion("MSS031")).toBe(true); // bare part number
  });
  it("is false for non-pricing questions", () => {
    expect(isPricingQuestion("who attended the Terumo meeting")).toBe(false);
  });
});

describe("matchCatalog", () => {
  const catalog: CatalogItem[] = [
    { partNumber: "MSS031", description: "Syringe 3ml", unitCost: 12.5, sourceFile: "x" },
    { partNumber: "MSS099", description: "Stopcock manifold", unitCost: 4, sourceFile: "x" },
    { partNumber: "CAT200", description: "Catheter introducer", unitCost: 99, sourceFile: "x" },
  ];
  it("matches a part number token highest", () => {
    const hits = matchCatalog("price of MSS031", catalog, 5);
    expect(hits[0].partNumber).toBe("MSS031");
  });
  it("matches by description keyword", () => {
    const hits = matchCatalog("catheter pricing", catalog, 5);
    expect(hits.map((h) => h.partNumber)).toContain("CAT200");
  });
  it("returns nothing when no part or keyword matches", () => {
    expect(matchCatalog("balloon pump", catalog, 5)).toEqual([]);
  });
});

describe("bestSnippet", () => {
  const note = `---\ntitle: x\n---\n\n## Background\n\nThe Terumo GTIN system is a recurring blocker.\n\n## Next\n\nFollow up on samples.`;
  it("returns a snippet around the densest keyword match", () => {
    const { score, snippet } = bestSnippet("GTIN blocker", note);
    expect(score).toBeGreaterThan(0);
    expect(snippet).toContain("GTIN");
    expect(snippet).not.toContain("---"); // frontmatter stripped
  });
  it("scores zero when nothing matches", () => {
    expect(bestSnippet("forecast pipeline", note).score).toBe(0);
  });
});
