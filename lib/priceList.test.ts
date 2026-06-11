import { describe, it, expect } from "vitest";
import { parsePriceTables } from "./priceList";

const SAMPLE = `---
workstream: merit
type: note
---

# OEM Price List

| Part # | Description | Unit Cost |
|--------|-------------|-----------|
| H3445878 | Stopcock, 3-way, build-to-Merit-spec | $12.50 |
| H3524460 | Extension line, 10in | $4.20 |
| H9000001 | Custom assembly | TBD |

Some prose that is not a table.
`;

describe("price list parser", () => {
  const items = parsePriceTables(SAMPLE, "300 Merit/Price List/oem.md");

  it("parses part number, description, and cost from a markdown table", () => {
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      partNumber: "H3445878",
      description: "Stopcock, 3-way, build-to-Merit-spec",
      unitCost: 12.5,
    });
    expect(items[1].unitCost).toBe(4.2);
  });

  it("yields null cost when the cell is unparseable", () => {
    expect(items[2].partNumber).toBe("H9000001");
    expect(items[2].unitCost).toBeNull();
  });
});

// The real vault uses headers like "Part#" (no space) and "High Price".
const REAL = `## MEDALLION SYRINGES

| Part# | Description | High Price |
|-------|-------------|------------|
| K01-00786P | 10ml Dark Green Plunger Medication Printed | $3.93 |
| K01-05717 | 30ml Light Green Syringe without Merit Logo | $3.93 |
`;

describe("price list parser, real-vault header shapes", () => {
  it('maps "Part#" and "High Price" via keyword matching', () => {
    const items = parsePriceTables(REAL, "300 Merit/Price List/chunk.md");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ partNumber: "K01-00786P", unitCost: 3.93 });
    expect(items[1].description).toContain("30ml Light Green");
  });
});
