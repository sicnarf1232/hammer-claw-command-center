import { describe, it, expect } from "vitest";
import { parseStructuredQuote } from "./parseStructured";
import { normalizeQuote } from "./normalize";
import { validateQuote } from "./validate";
import { buildQuoteHtml } from "./quoteHtml";
import type { RawQuoteInput } from "./types";

const STRUCTURED = `Customer: Balt USA
Contact: guru vattikuti
Date: June 26, 2026
Tag: 8F Dilators
Description: 8F Custom Green Dilators - NRE & Parts

Line Item 1
* Quantity: 1
* Part Number: NRE
* Description: NRE - 8F Custom Green Dilator Setup
* Details:
   * Tooling for 8F Tipping mold: $15,000
   * Tipping validation: $10,000
   * Part Number Set Up (6x): $16,200
* Unit Price: $41,200
* Lead Time: 24-30 weeks

Line Item 2
* Quantity: 50
* Part Number: TBD (8F 110cm)
* Description: 8F Custom Green Dilator - 110cm
* Details:
   * 8F French size
   * 110cm length
   * Green extrusion
* Unit Price: $16.50
* Lead Time: 4-6 weeks (after NRE)
`;

describe("structured parser", () => {
  it("parses header fields and line items with nested details", () => {
    const raw = parseStructuredQuote(STRUCTURED);
    expect(raw.customerName).toBe("Balt USA");
    expect(raw.customerContact).toBe("guru vattikuti");
    expect(raw.quoteShort).toBe("8F Dilators");
    expect(raw.lineItems).toHaveLength(2);

    const [nre, dilator] = raw.lineItems!;
    expect(nre.partNo).toBe("NRE");
    expect(nre.attributes).toEqual([
      "Tooling for 8F Tipping mold: $15,000",
      "Tipping validation: $10,000",
      "Part Number Set Up (6x): $16,200",
    ]);
    expect(dilator.partNo).toBe("TBD (8F 110cm)");
    expect(dilator.price).toBe("$16.50");
  });

  it("normalizes parsed input: canonical customer, derived id, title-cased contact", () => {
    const spec = normalizeQuote(parseStructuredQuote(STRUCTURED));
    expect(spec.customerName).toBe("Balt");
    expect(spec.quotedFor).toBe("Guru Vattikuti");
    expect(spec.quoteDate).toBe("June 26, 2026");
    expect(spec.quoteId).toBe("Balt_06.26.26_8F_Dilators");
    // Parser items are custom: no auto sterility, no default stacking.
    expect(spec.lineItems[1].closing).toBe("");
    expect(spec.lineItems[1].leadStacked).toBe(false);
  });
});

describe("normalize derivations for price-list (non-custom) items", () => {
  it("infers sterility and stacks a default lead time", () => {
    const raw: RawQuoteInput = {
      customerName: "Acme",
      customerContact: "Jane Doe",
      quoteDate: "2026-05-05",
      quoteShort: "Parts",
      lineItems: [{ partNo: "K01-00786P", quantity: "100", price: "4.50" }],
    };
    const spec = normalizeQuote(raw);
    const it = spec.lineItems[0];
    expect(it.closing).toBe("Bulk Non-Sterile.");
    expect(it.leadStacked).toBe(true);
    expect(it.leadAlt).toBe("4-6 weeks");
    expect(it.price).toBe("$4.50");
  });
});

describe("validation", () => {
  it("flags missing required fields and empty line items", () => {
    const spec = normalizeQuote({});
    const { errors } = validateQuote(spec);
    expect(errors).toContain("Customer name is required.");
    expect(errors).toContain("At least one line item is required.");
  });

  it("requires explicit lead time for NRE", () => {
    const spec = normalizeQuote({
      customerName: "Acme",
      customerContact: "Jane Doe",
      quoteDate: "2026-05-05",
      quoteShort: "NRE",
      lineItems: [
        { partNo: "NRE", title: "Setup", quantity: "1", price: "$1,000", custom: true },
      ],
    });
    const { errors } = validateQuote(spec);
    expect(errors.some((e) => e.includes("explicit lead time"))).toBe(true);
  });

  it("warns on duplicate part numbers", () => {
    const spec = normalizeQuote({
      customerName: "Acme",
      customerContact: "Jane Doe",
      quoteDate: "2026-05-05",
      quoteShort: "Dup",
      lineItems: [
        { partNo: "PN1", title: "A", price: "$1", leadTime: "4 weeks", custom: true },
        { partNo: "PN1", title: "B", price: "$2", leadTime: "4 weeks", custom: true },
      ],
    });
    const { warnings } = validateQuote(spec);
    expect(warnings.some((w) => w.includes("share part number"))).toBe(true);
  });
});

// The Balt reference (1 NRE + 4 dilators) must paginate 3 pages: page 1 = 3
// rows, page 2 = 2 rows + order line + disclaimer, page 3 = closing.
const BALT: RawQuoteInput = {
  customerName: "Balt",
  customerContact: "Guru Vattikuti",
  quoteDate: "June 26, 2026",
  quoteShort: "8F Dilators",
  description: "8F Custom Green Dilators - NRE & Parts",
  lineItems: [
    {
      quantity: "1",
      partNo: "NRE",
      title: "NRE - 8F Custom Green Dilator Setup",
      attributes: [
        "Tooling for 8F Tipping mold: $15,000",
        "Tipping validation: $10,000",
        "Part Number Set Up (6x): $16,200",
        "Standard dilator tips",
        "Balt USA holds regulatory",
        "Total NRE lead time: 24-30 weeks",
      ],
      price: "$41,200",
      leadTime: "24-30 weeks",
      custom: true,
    },
    ...["110cm", "120cm", "130cm", "135cm"].map((len) => ({
      quantity: "50",
      partNo: `TBD (8F ${len})`,
      title: `8F Custom Green Dilator - ${len}`,
      attributes: ["8F French size", `${len} length`, "Green extrusion", "Green molded hub", "Standard dilator tip"],
      closing: "Bulk Non-Sterile.",
      price: "$16.75",
      leadTime: "4-6 weeks (after NRE)",
      custom: true,
    })),
  ],
};

describe("pagination", () => {
  const countRows = (sectionHtml: string) =>
    (sectionHtml.match(/border-bottom:1\.5px solid #C9252C/g) || []).length;

  it("splits the Balt reference into 3 pages with a 3/2 row split", () => {
    const spec = normalizeQuote(BALT);
    const html = buildQuoteHtml(spec, { screen: false });
    const sections = html.split('<section class="qpage"').slice(1);
    expect(sections).toHaveLength(3);
    expect(countRows(sections[0])).toBe(3);
    expect(countRows(sections[1])).toBe(2);
    expect(countRows(sections[2])).toBe(0);
    // Order line + disclaimer land on page 2; signature closing on page 3.
    expect(sections[1]).toContain("Please email order to");
    expect(sections[2]).toContain("Jordan Francis signature");
    expect(html).toContain("Page 1 of 3");
  });

  it("keeps a small quote on a single page", () => {
    const spec = normalizeQuote({
      ...BALT,
      lineItems: [BALT.lineItems![1]],
    });
    const html = buildQuoteHtml(spec, { screen: false });
    const sections = html.split('<section class="qpage"').slice(1);
    expect(sections.length).toBeGreaterThanOrEqual(1);
  });
});
