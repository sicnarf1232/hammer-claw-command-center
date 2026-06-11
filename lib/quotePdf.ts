import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Server-side Merit OEM branded quote PDF (no logo asset, so a clean typographic
// header). House style: no em dashes in any generated text.

export interface QuoteLineItem {
  partNumber: string;
  description: string;
  qty: number;
  unitCost: number;
}

export interface QuoteInput {
  title: string;
  customer: string;
  notes: string;
  lineItems: QuoteLineItem[];
  dateISO: string; // caller supplies (Date is unavailable in some contexts)
}

const MERIT_BLUE = rgb(0.114, 0.306, 0.847); // ~#1d4ed8
const INK = rgb(0.12, 0.16, 0.23);
const MUTED = rgb(0.45, 0.5, 0.56);
const RULE = rgb(0.85, 0.87, 0.9);

export async function buildQuotePdf(input: QuoteInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const M = 54; // margin
  const right = 612 - M;
  let y = 792 - M;

  const draw = (
    text: string,
    x: number,
    yy: number,
    size: number,
    f = font,
    color = INK,
  ) => page.drawText(clean(text), { x, y: yy, size, font: f, color });

  const drawRight = (
    text: string,
    xRight: number,
    yy: number,
    size: number,
    f = font,
    color = INK,
  ) => {
    const w = f.widthOfTextAtSize(clean(text), size);
    page.drawText(clean(text), { x: xRight - w, y: yy, size, font: f, color });
  };

  // Brand header
  draw("MERIT MEDICAL", M, y, 20, bold, MERIT_BLUE);
  draw("OEM", M + bold.widthOfTextAtSize("MERIT MEDICAL ", 20), y, 20, bold, INK);
  drawRight("QUOTE", right, y, 20, bold, MUTED);
  y -= 14;
  draw("Original Equipment Manufacturing", M, y, 9, font, MUTED);
  y -= 18;
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 1.5, color: MERIT_BLUE });
  y -= 24;

  // Meta
  draw(input.title || "Quote", M, y, 14, bold, INK);
  drawRight(input.dateISO, right, y, 10, font, MUTED);
  y -= 16;
  if (input.customer) {
    draw(`Prepared for: ${input.customer}`, M, y, 10, font, MUTED);
    y -= 16;
  }
  y -= 6;

  // Table header
  const colPart = M;
  const colDesc = M + 90;
  const colQty = right - 180;
  const colUnit = right - 110;
  const colTotal = right;

  draw("PART #", colPart, y, 8, bold, MUTED);
  draw("DESCRIPTION", colDesc, y, 8, bold, MUTED);
  drawRight("QTY", colQty, y, 8, bold, MUTED);
  drawRight("UNIT", colUnit, y, 8, bold, MUTED);
  drawRight("TOTAL", colTotal, y, 8, bold, MUTED);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.75, color: RULE });
  y -= 16;

  let total = 0;
  for (const it of input.lineItems) {
    const lineTotal = it.qty * it.unitCost;
    total += lineTotal;

    draw(it.partNumber || "-", colPart, y, 9, font, INK);
    // Description wraps to the available width.
    const descLines = wrap(it.description || "", font, 9, colQty - colDesc - 10);
    descLines.forEach((dl, idx) => draw(dl, colDesc, y - idx * 11, 9, font, INK));
    drawRight(String(it.qty), colQty, y, 9, font, INK);
    drawRight(money(it.unitCost), colUnit, y, 9, font, INK);
    drawRight(money(lineTotal), colTotal, y, 9, font, INK);

    const rows = Math.max(1, descLines.length);
    y -= rows * 11 + 6;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.5, color: RULE });

    if (y < 120) break; // single page guard; flag overflow rather than crash
  }

  y -= 8;
  drawRight("Total", colUnit, y, 11, bold, INK);
  drawRight(money(total), colTotal, y, 11, bold, MERIT_BLUE);

  if (input.notes.trim()) {
    y -= 28;
    draw("Notes", M, y, 9, bold, MUTED);
    y -= 14;
    for (const nl of wrap(input.notes, font, 9, right - M)) {
      draw(nl, M, y, 9, font, INK);
      y -= 12;
      if (y < 60) break;
    }
  }

  // Footer
  draw(
    "This quote is for OEM components manufactured to Merit specification. Pricing valid for 30 days.",
    M,
    48,
    8,
    font,
    MUTED,
  );

  return doc.save();
}

// Strip em dashes from any text that lands in the PDF (house style).
function clean(s: string): string {
  return s.replace(/—/g, ", ");
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function wrap(
  text: string,
  font: import("pdf-lib").PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
