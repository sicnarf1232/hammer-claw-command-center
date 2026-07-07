import { describe, expect, it } from "vitest";
import {
  parseSpreadsheet,
  headerSignature,
  applyMapping,
  planAgreementCommit,
  parsePrice,
  parseDateISO,
  type ColumnMapping,
  type ExistingAgreement,
} from "./engine";

function csvBytes(csv: string): Uint8Array {
  return new TextEncoder().encode(csv);
}

const CSV = [
  "Item #,Description,Unit Price,Qty Break,Effective,Expires",
  'AC-1001,7F Sheath,"$1,234.50",1,2026-01-01,',
  "AC-1001,7F Sheath,1100.00,100,2026-01-01,12/31/2026",
  "AC-2002,Hub,,1,,",
  ",,,,,",
].join("\n");

const MAPPING: ColumnMapping = {
  columns: {
    part_number: "Item #",
    unit_price: "Unit Price",
    min_qty: "Qty Break",
    effective_date: "Effective",
    expires: "Expires",
  },
  defaults: { origin: "legacy", currency: "USD" },
};

describe("parseSpreadsheet + applyMapping", () => {
  const sheet = parseSpreadsheet(csvBytes(CSV));

  it("parses headers and rows, dropping blank lines", () => {
    expect(sheet.headers[0]).toBe("Item #");
    expect(sheet.rows).toHaveLength(3);
  });

  it("maps rows to drafts with tiers, currency strings, and dates", () => {
    const { drafts, issues } = applyMapping(sheet, MAPPING, "2026-07-07");
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      partNumber: "AC-1001",
      unitPrice: 1234.5,
      minQty: 1,
      effectiveDate: "2026-01-01",
      expires: null, // grandfathered
      origin: "legacy",
    });
    expect(drafts[1]).toMatchObject({ minQty: 100, expires: "2026-12-31" });
    expect(issues).toEqual([{ rowIndex: 2, issue: expect.stringContaining("price") }]);
  });

  it("header signature is order-preserving and case/space-insensitive", () => {
    const a = headerSignature(["Item #", "Unit Price"]);
    expect(a).toBe(headerSignature([" item # ", "UNIT PRICE"]));
    expect(a).not.toBe(headerSignature(["Unit Price", "Item #"]));
  });
});

describe("value parsers", () => {
  it("parsePrice handles $, commas, parens-negative rejection", () => {
    expect(parsePrice("$1,234.50")).toBe(1234.5);
    expect(parsePrice("12")).toBe(12);
    expect(parsePrice("(5.00)")).toBeNull(); // negative price rejected
    expect(parsePrice("n/a")).toBeNull();
  });
  it("parseDateISO handles ISO and M/D/YYYY", () => {
    expect(parseDateISO("2026-01-02")).toBe("2026-01-02");
    expect(parseDateISO("1/2/2026")).toBe("2026-01-02");
    expect(parseDateISO("12/31/26")).toBe("2026-12-31");
    expect(parseDateISO("garbage")).toBeNull();
  });
});

describe("planAgreementCommit", () => {
  const existing: ExistingAgreement[] = [
    { id: 1, accountId: 42, partNumber: "AC-1001", minQty: 1, effectiveDate: "2025-01-01", expires: null, supersededBy: null },
    { id: 2, accountId: 42, partNumber: "AC-1001", minQty: 100, effectiveDate: "2025-01-01", expires: "2025-12-31", supersededBy: null }, // expired
    { id: 3, accountId: 42, partNumber: "AC-1001", minQty: 1, effectiveDate: "2024-01-01", expires: null, supersededBy: 1 }, // already superseded
    { id: 4, accountId: 7, partNumber: "AC-1001", minQty: 1, effectiveDate: "2025-01-01", expires: null, supersededBy: null }, // other account
  ];
  const draft = {
    rowIndex: 0, partNumber: "ac-1001", unitPrice: 999, currency: "USD",
    minQty: 1, effectiveDate: "2026-07-01", expires: null, origin: "negotiated",
    accountName: null, accountId: 42,
  };

  it("supersedes only the live in-date same-tier row for the same account", () => {
    const plan = planAgreementCommit(existing, [draft], "2026-07-07");
    expect(plan.supersede).toEqual([{ existingId: 1, byInsertIndex: 0 }]);
  });

  it("different tier does not supersede", () => {
    const plan = planAgreementCommit(existing, [{ ...draft, minQty: 50 }], "2026-07-07");
    expect(plan.supersede).toEqual([]);
  });
});
