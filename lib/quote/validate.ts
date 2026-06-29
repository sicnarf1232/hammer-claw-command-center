// Validation rules that must pass before allowing a PDF render, plus softer
// warnings the UI surfaces but does not block on. Pure, unit-tested.

import type { QuoteSpec } from "@/lib/quote/types";

export interface ValidationResult {
  errors: string[]; // block render
  warnings: string[]; // advise, do not block
}

export function validateQuote(spec: QuoteSpec): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!spec.customerName.trim()) errors.push("Customer name is required.");
  if (!spec.quotedFor.trim()) errors.push("Contact (Quoted For) is required.");
  if (!spec.quoteDate.trim()) errors.push("Quote date is required.");
  if (!spec.quoteShort.trim())
    errors.push("Quote tag (quote_short) is required.");

  if (spec.lineItems.length === 0) {
    errors.push("At least one line item is required.");
  }

  const seen = new Map<string, number>();
  spec.lineItems.forEach((it, i) => {
    const n = i + 1;
    if (!it.quantity.trim()) errors.push(`Line ${n}: quantity is required.`);
    if (!it.price.trim()) errors.push(`Line ${n}: price is required.`);
    if (!it.title.trim()) errors.push(`Line ${n}: a description title is required.`);

    if (it.leadStacked) {
      if (!it.leadStock.trim())
        errors.push(`Line ${n}: stacked lead time needs a stock label.`);
      if (!it.leadAlt.trim())
        errors.push(`Line ${n}: stacked lead time needs an alternate.`);
    } else if (!it.leadTime.trim()) {
      errors.push(`Line ${n}: a lead time is required.`);
    }

    const pnUpper = it.partNo.trim().toUpperCase();
    if ((pnUpper === "NRE" || pnUpper.startsWith("TBD")) && !leadSet(it)) {
      errors.push(`Line ${n}: ${it.partNo} requires an explicit lead time.`);
    }

    if (it.partNo.length > 16) {
      warnings.push(
        `Line ${n}: part number "${it.partNo}" is long and may overflow the column.`,
      );
    }

    const key = it.partNo.trim().toLowerCase();
    if (key) {
      const prev = seen.get(key);
      if (prev) {
        warnings.push(
          `Lines ${prev} and ${n} share part number "${it.partNo}" (intended size/length variant?).`,
        );
      } else {
        seen.set(key, n);
      }
    }
  });

  return { errors, warnings };
}

function leadSet(it: QuoteSpec["lineItems"][number]): boolean {
  return it.leadStacked ? Boolean(it.leadAlt.trim()) : Boolean(it.leadTime.trim());
}
