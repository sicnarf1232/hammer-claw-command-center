// Deterministic parser for the structured "Line Item N" prompt-filler format.
// Tolerates "* Key:", "- Key:", "• Key:" bullets and a nested "Details:" list.
// Emits a RawQuoteInput that normalizeQuote() turns into a full spec.

import type { RawLineItem, RawQuoteInput } from "@/lib/quote/types";

const BULLET = /^\s*[*\-•]\s*/;

// Strip a leading bullet marker and surrounding whitespace.
function stripBullet(line: string): string {
  return line.replace(BULLET, "").trim();
}

// Split a "Key: Value" line. Returns null when there is no colon.
function splitKV(line: string): { key: string; value: string } | null {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  return {
    key: line.slice(0, idx).trim().toLowerCase(),
    value: line.slice(idx + 1).trim(),
  };
}

function indentOf(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].replace(/\t/g, "  ").length : 0;
}

export function parseStructuredQuote(text: string): RawQuoteInput {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const input: RawQuoteInput = { lineItems: [] };
  let current: RawLineItem | null = null;
  let inDetails = false;
  let detailsIndent = 0;

  const pushCurrent = () => {
    if (current) input.lineItems!.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      inDetails = false;
      continue;
    }

    // "Line Item N" header opens a new record.
    if (/^\s*line\s+item\b/i.test(line)) {
      pushCurrent();
      current = { custom: true, attributes: [] };
      inDetails = false;
      continue;
    }

    const bare = stripBullet(line);
    const kv = splitKV(bare);

    // Inside a Details list: each deeper bullet is one attribute.
    if (inDetails) {
      const isBullet = BULLET.test(line.trim()) || BULLET.test(line);
      if (isBullet && indentOf(line) > detailsIndent && current) {
        // A nested "key: value" detail keeps the whole text as the attribute.
        current.attributes!.push(bare);
        continue;
      }
      // Anything not more-indented ends the details block; fall through.
      inDetails = false;
    }

    if (!kv) continue;

    if (!current) {
      // Header-level fields before any line item (Customer / Contact / etc.)
      applyHeaderField(input, kv.key, kv.value);
      continue;
    }

    if (kv.key === "details") {
      inDetails = true;
      detailsIndent = indentOf(line);
      // Allow an inline first detail on the same line: "Details: foo"
      if (kv.value) current.attributes!.push(kv.value);
      continue;
    }

    applyLineField(current, kv.key, kv.value);
  }
  pushCurrent();

  return input;
}

function applyHeaderField(input: RawQuoteInput, key: string, value: string) {
  switch (key) {
    case "customer":
    case "customer name":
      input.customerName = value;
      break;
    case "customer short":
      input.customerShort = value;
      break;
    case "contact":
    case "quoted for":
      input.customerContact = value;
      break;
    case "description":
      input.description = value;
      break;
    case "quote date":
    case "date":
      input.quoteDate = value;
      break;
    case "tag":
    case "quote tag":
    case "quote short":
      input.quoteShort = value;
      break;
    case "lead time summary":
      input.leadTimeSummary = value;
      break;
  }
}

function applyLineField(item: RawLineItem, key: string, value: string) {
  switch (key) {
    case "quantity":
    case "qty":
      item.quantity = value;
      break;
    case "part number":
    case "part no":
    case "part no.":
    case "pn":
      item.partNo = value;
      break;
    case "description":
    case "title":
      // Use as the description; normalizer derives a title when none is given.
      item.description = value;
      if (!item.title && key === "title") item.title = value;
      break;
    case "unit price":
    case "price":
    case "price/ea":
    case "price/ea.":
      item.price = value;
      break;
    case "lead time":
    case "lead":
      item.leadTime = value;
      break;
    case "closing":
    case "sterility":
      item.closing = value;
      break;
  }
}
