// Quote data model. Mirrors the "Merit Medical OEM Quote Redesign" handoff
// data object: only these fields vary per quote; everything else (letterhead,
// disclaimer, signature block, footer) is static template living in the render.
// House style: no em dashes in any generated content.

export type TableHeaderStyle = "Graphite" | "Merit Red";

// The optional closing tagline under a line-item description.
export type Closing =
  | ""
  | "Bulk Non-Sterile."
  | "Sterile"
  | "Single-Sterile.";

export interface QuoteLineItem {
  quantity: string; // string for tolerance: "1", "50", "5,000", "1 lot"
  partNo: string; // "NRE" | "TBD" | "TBD (8F 110cm)" | a real PN
  title: string; // concise product name
  attributes: string[]; // 0..N centered detail lines
  closing: Closing; // sterility tagline, or "" to omit
  price: string; // normalized with a "$" prefix, e.g. "$16.75"
  leadTime: string; // single-mode verbatim, e.g. "24-30 weeks"
  leadStacked: boolean; // true => render In Stock / or / leadAlt
  leadStock: string; // only when stacked (default "In Stock")
  leadAlt: string; // only when stacked, e.g. "6-8 weeks"
  custom: boolean; // parser/manual-added: no auto sterility, no stacking default
}

export interface QuoteSpec {
  quoteId: string; // red revision tag, top-right (derived unless overridden)
  description: string; // the project line under "Description"
  quoteDate: string; // ALWAYS "Month Day, Year"
  quotedFor: string; // the customer contact
  customerName: string; // canonical entity name (bold into the thank-you)
  customerShort: string; // short form used in the quote id
  quoteShort: string; // filename tag used in the quote id
  leadTimeSummary: string; // composed from line items unless overridden
  lineItems: QuoteLineItem[];
  tableHeaderStyle: TableHeaderStyle; // "Graphite" (#333335) | "Merit Red"
  showPageNumbers: boolean;
}

// Loose shape produced by the parsers before normalization fills derived fields.
export interface RawLineItem {
  quantity?: string | number;
  partNo?: string;
  title?: string;
  description?: string; // free-form description when no explicit title
  attributes?: string[];
  closing?: string;
  price?: string | number;
  leadTime?: string;
  leadStacked?: boolean;
  leadStock?: string;
  leadAlt?: string;
  custom?: boolean;
}

export interface RawQuoteInput {
  customerName?: string;
  customerShort?: string;
  customerContact?: string;
  description?: string;
  quoteShort?: string;
  quoteDate?: string;
  leadTimeSummary?: string;
  tableHeaderStyle?: string;
  showPageNumbers?: boolean;
  lineItems?: RawLineItem[];
}

export const BLANK_LINE_ITEM: QuoteLineItem = {
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
  custom: true,
};
