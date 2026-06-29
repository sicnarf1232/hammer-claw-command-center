import { describe, it, expect } from "vitest";
import {
  composeLeadTimeSummary,
  defaultLeadTime,
  deriveQuoteId,
  formatLongDate,
  formatMMDDYY,
  formatQuantity,
  inferSterility,
  normalizeCustomerName,
  normalizePrice,
  parseLeadPhrase,
  sanitize,
  suggestQuoteTag,
  titleCaseContact,
} from "./derive";
import type { QuoteLineItem } from "./types";

const li = (p: Partial<QuoteLineItem>): QuoteLineItem => ({
  quantity: "1",
  partNo: "",
  title: "",
  attributes: [],
  closing: "",
  price: "",
  leadTime: "",
  leadStacked: false,
  leadStock: "In Stock",
  leadAlt: "",
  custom: false,
  ...p,
});

describe("sanitize + quote id", () => {
  it("sanitizes runs of disallowed chars to single underscore", () => {
    expect(sanitize("Stryker NV")).toBe("Stryker_NV");
    expect(sanitize("  W.L. Gore!! ")).toBe("W.L._Gore");
  });

  it("formats MM.DD.YY across input shapes", () => {
    expect(formatMMDDYY("June 26, 2026")).toBe("06.26.26");
    expect(formatMMDDYY("2026-06-26")).toBe("06.26.26");
    expect(formatMMDDYY("6/26/26")).toBe("06.26.26");
  });

  it("derives the canonical quote id", () => {
    expect(
      deriveQuoteId({
        customerShort: "Balt",
        quoteDate: "June 26, 2026",
        quoteShort: "8F Dilators",
      }),
    ).toBe("Balt_06.26.26_8F_Dilators");
  });

  it("falls back to first word of customer name when short omitted", () => {
    expect(
      deriveQuoteId({
        customerName: "Stryker Neurovascular",
        quoteDate: "2026-05-05",
        quoteShort: "Sample",
      }),
    ).toBe("Stryker_05.05.26_Sample");
  });

  it("formats long dates", () => {
    expect(formatLongDate("2026-06-26")).toBe("June 26, 2026");
  });
});

describe("customer + contact normalization", () => {
  it("maps known variants to canonical names", () => {
    expect(normalizeCustomerName("Stryker NV")).toBe("Stryker Neurovascular");
    expect(normalizeCustomerName("Balt USA")).toBe("Balt");
    expect(normalizeCustomerName("W.L. Gore")).toBe("WL Gore");
  });
  it("passes through unknown names trimmed", () => {
    expect(normalizeCustomerName("  Acme  Medical ")).toBe("Acme Medical");
  });
  it("title-cases contacts", () => {
    expect(titleCaseContact("duran yetkinler")).toBe("Duran Yetkinler");
  });
});

describe("quote tag suggestion", () => {
  it("single category -> acronym", () => {
    expect(suggestQuoteTag(["Tuohy Borst Valves"])).toBe("TBV");
  });
  it("two categories -> joined", () => {
    expect(suggestQuoteTag(["Tuohy Borst Valves", "Vaclok Syringes"])).toBe(
      "TBV_Vac",
    );
  });
  it("three or more -> PartsQuote", () => {
    expect(
      suggestQuoteTag([
        "Tuohy Borst Valves",
        "Vaclok Syringes",
        "Medallion Syringes",
      ]),
    ).toBe("PartsQuote");
  });
});

describe("sterility inference", () => {
  it("P suffix beats everything -> Bulk Non-Sterile", () => {
    expect(inferSterility("K01-00786P").closing).toBe("Bulk Non-Sterile.");
    expect(inferSterility("MSS011P").closing).toBe("Bulk Non-Sterile.");
    expect(inferSterility("K01-02040P*").closing).toBe("Bulk Non-Sterile.");
  });
  it("K0n- without P -> Sterile", () => {
    expect(inferSterility("K01-05717").closing).toBe("Sterile");
  });
  it("all-numeric 5/7 -> Bulk Non-Sterile", () => {
    expect(inferSterility("500366005").closing).toBe("Bulk Non-Sterile.");
    expect(inferSterility("702238001").closing).toBe("Bulk Non-Sterile.");
  });
  it("named SKU with dash -> Sterile unless needle/valve word", () => {
    expect(inferSterility("pro-4f-11").closing).toBe("Sterile");
    const ask = inferSterility("MERIT-X-12", "advanced needle set");
    expect(ask.closing).toBe("");
    expect(ask.ask).toBe(true);
  });
  it("NRE and TBD never get a closing", () => {
    expect(inferSterility("NRE").closing).toBe("");
    expect(inferSterility("TBD (8F 110cm)").closing).toBe("");
  });
  it("unknown -> ask", () => {
    expect(inferSterility("12345").ask).toBe(true);
  });
});

describe("defaults + formatting", () => {
  it("default lead times by sterility", () => {
    expect(defaultLeadTime("Bulk Non-Sterile.")).toBe("4-6 weeks");
    expect(defaultLeadTime("Sterile")).toBe("6-8 weeks");
    expect(defaultLeadTime("")).toBe("");
  });
  it("formats quantity with separators, passes through non-numeric", () => {
    expect(formatQuantity("5000")).toBe("5,000");
    expect(formatQuantity("50")).toBe("50");
    expect(formatQuantity("1 lot")).toBe("1 lot");
  });
  it("normalizes price with a dollar prefix", () => {
    expect(normalizePrice("3.93")).toBe("$3.93");
    expect(normalizePrice("$3,500")).toBe("$3,500");
    expect(normalizePrice(16.5)).toBe("$16.5");
  });
  it("parses stacked lead phrase", () => {
    const p = parseLeadPhrase("in stock or 6-8 weeks");
    expect(p.leadStacked).toBe(true);
    expect(p.leadAlt).toBe("6-8 weeks");
  });
});

describe("leadTimeSummary composition", () => {
  it("groups distinct PNs per lead time", () => {
    const s = composeLeadTimeSummary([
      li({ partNo: "K01-00786P", leadTime: "4-6 weeks" }),
      li({ partNo: "MSS011P", leadTime: "6-8 weeks" }),
    ]);
    expect(s).toBe(
      "Lead time for first order is 4-6 weeks for K01-00786P, & 6-8 weeks for MSS011P.",
    );
  });
  it("collapses 4+ PNs in a group to subsequent production parts", () => {
    const items = ["A1", "A2", "A3", "A4"].map((pn) =>
      li({ partNo: pn, leadTime: "4-6 weeks" }),
    );
    const s = composeLeadTimeSummary([
      li({ partNo: "NRE", leadTime: "24-30 weeks" }),
      ...items,
    ]);
    expect(s).toBe(
      "Lead time for first order is 24-30 weeks for NRE, & 4-6 weeks for subsequent production parts.",
    );
  });
});
