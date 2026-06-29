// Normalizer: turns a loose RawQuoteInput (from either parser, or the UI) into
// a complete QuoteSpec, applying the derivation rules. Both parsers funnel
// through here so behavior is identical regardless of input format.

import {
  composeLeadTimeSummary,
  defaultLeadTime,
  deriveQuoteId,
  deriveTitle,
  formatLongDate,
  inferSterility,
  normalizeCustomerName,
  normalizePrice,
  parseLeadPhrase,
  titleCaseContact,
} from "@/lib/quote/derive";
import {
  type Closing,
  type QuoteLineItem,
  type QuoteSpec,
  type RawLineItem,
  type RawQuoteInput,
  type TableHeaderStyle,
} from "@/lib/quote/types";

const CLOSINGS: Closing[] = [
  "",
  "Bulk Non-Sterile.",
  "Sterile",
  "Single-Sterile.",
];

function asClosing(v: unknown): Closing {
  const s = typeof v === "string" ? v.trim() : "";
  return (CLOSINGS as string[]).includes(s) ? (s as Closing) : "";
}

// Normalize a single line item. `custom` controls whether sterility inference
// and stacking defaults run (price-list items get them; custom items do not).
export function normalizeLineItem(raw: RawLineItem): QuoteLineItem {
  const custom = raw.custom === true;
  const partNo = (raw.partNo ?? "").trim();
  const description = (raw.description ?? "").trim();
  const title = (raw.title ?? "").trim() || deriveTitle(description);

  const attributes = Array.isArray(raw.attributes)
    ? raw.attributes.map((a) => String(a).trim()).filter(Boolean)
    : [];

  // Lead time: honor an explicit "in stock or X" phrase, else explicit fields.
  let leadStacked = raw.leadStacked === true;
  let leadStock = (raw.leadStock ?? "In Stock").trim() || "In Stock";
  let leadAlt = (raw.leadAlt ?? "").trim();
  let leadTime = (raw.leadTime ?? "").trim();
  if (!leadStacked && /^in\s+stock\s+or\s+/i.test(leadTime)) {
    const parsed = parseLeadPhrase(leadTime);
    leadStacked = parsed.leadStacked;
    leadStock = parsed.leadStock;
    leadAlt = parsed.leadAlt;
    leadTime = parsed.leadTime;
  }

  // Closing + lead-time defaults.
  let closing = asClosing(raw.closing);
  if (!custom) {
    // Price-list item: infer sterility when not explicitly set, default leads.
    if (!closing) {
      const inf = inferSterility(partNo, description || title);
      closing = inf.closing;
    }
    // Off-the-shelf parts default to the stacked In Stock presentation.
    if (!leadStacked && !leadAlt && !leadTime) {
      const def = defaultLeadTime(closing);
      if (def) {
        leadStacked = true;
        leadStock = "In Stock";
        leadAlt = def;
      }
    }
  }

  return {
    quantity: String(raw.quantity ?? "").trim() || "1",
    partNo,
    title,
    attributes,
    closing,
    price: normalizePrice(raw.price ?? ""),
    leadTime,
    leadStacked,
    leadStock,
    leadAlt,
    custom,
  };
}

function asHeaderStyle(v: unknown): TableHeaderStyle {
  return v === "Merit Red" ? "Merit Red" : "Graphite";
}

// Build a complete QuoteSpec from raw input. Derives quoteId, normalizes the
// customer name and contact, and composes leadTimeSummary unless overridden.
export function normalizeQuote(raw: RawQuoteInput): QuoteSpec {
  const customerName = normalizeCustomerName(raw.customerName ?? "");
  const customerShort = (raw.customerShort ?? "").trim();
  const quotedFor = titleCaseContact(raw.customerContact ?? "");
  const quoteDate = formatLongDate(raw.quoteDate ?? "");
  const quoteShort = (raw.quoteShort ?? "").trim();

  const lineItems = (raw.lineItems ?? []).map(normalizeLineItem);

  const quoteId = deriveQuoteId({
    customerShort,
    customerName,
    quoteDate,
    quoteShort,
  });

  const leadTimeSummary =
    (raw.leadTimeSummary ?? "").trim() || composeLeadTimeSummary(lineItems);

  return {
    quoteId,
    description: (raw.description ?? "").trim(),
    quoteDate,
    quotedFor,
    customerName,
    customerShort,
    quoteShort,
    leadTimeSummary,
    lineItems,
    tableHeaderStyle: asHeaderStyle(raw.tableHeaderStyle),
    showPageNumbers: raw.showPageNumbers !== false,
  };
}
