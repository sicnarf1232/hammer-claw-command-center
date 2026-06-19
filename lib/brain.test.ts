import { describe, it, expect } from "vitest";
import { pickRelevant } from "./brain";

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
