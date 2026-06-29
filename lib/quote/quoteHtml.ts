// Renders a QuoteSpec into the Merit OEM quotation document as a single HTML
// string, paginated across US Letter pages. The markup and inline styles mirror
// the "Merit Medical OEM Quote Redesign" handoff exactly. The PDF route prints
// this through headless Chromium; the preview route serves the same HTML to an
// iframe, so the two cannot drift. House style: no em dashes.

import { LOGO_DATA_URI, SIGNATURE_DATA_URI } from "@/lib/quote/assets";
import { formatPrice, formatQuantity } from "@/lib/quote/derive";
import type { QuoteLineItem, QuoteSpec } from "@/lib/quote/types";

const PAGE_W = 816; // 8.5in @ 96dpi
const PAGE_H = 1056; // 11in @ 96dpi

// ---- Estimation constants (px) used by the paginator ----------------------
// Tuned so the Balt reference (1 NRE + 4 dilators) splits 3 / 2 / closing.
const LETTERHEAD_H = 262;
const COMPACT_HEADER_H = 68;
const FOOTER_H = 55;
const FIRST_PAD_V = 28; // content padding top+bottom, page 1
const CONT_PAD_V = 34; // content padding top+bottom, pages 2+
const META_H = 168; // quote-id row + fields panel + expiry note
const TABLE_HEADER_H = 33;
const ORDER_LINE_H = 40;
const DISCLAIMER_H = 215;
const CLOSING_H = 360;

const FIRST_REMAINING = PAGE_H - LETTERHEAD_H - FOOTER_H - FIRST_PAD_V;
const CONT_REMAINING = PAGE_H - COMPACT_HEADER_H - FOOTER_H - CONT_PAD_V;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pnFontSize(pn: string): string {
  if (pn.length > 12) return "11px";
  if (pn.length > 6) return "12.5px";
  return "14px";
}

function estimateRowHeight(it: QuoteLineItem): number {
  const titleH = 27;
  const attrH = it.attributes.length * 16.5;
  const closingH = it.closing ? 18 : 0;
  const descH = titleH + attrH + closingH;
  const leadH = it.leadStacked ? 40 : 34;
  return 26 + Math.max(descH, leadH, 20);
}

// ---- Static + variable block builders ------------------------------------

function letterhead(): string {
  return `<div>
  <div style="padding:30px 56px 14px;"><img src="${LOGO_DATA_URI}" alt="Merit Medical OEM" style="height:34px;display:block;"></div>
  <div style="background:#F7F7F8;border-top:1px solid #E6E7E8;border-bottom:1px solid #E6E7E8;padding:18px 56px;display:grid;grid-template-columns:1fr 1fr;gap:48px;">
    <div>
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:#C9252C;margin-bottom:8px;">Associate Sales Representative</div>
      <div style="font-family:Inter,sans-serif;font-weight:600;font-size:12.5px;color:#1A1A1C;line-height:1.7;">Jordan Francis</div>
      <div style="font-family:Inter,sans-serif;font-size:12.5px;color:#707073;line-height:1.7;">1600 West Merit Parkway</div>
      <div style="font-family:Inter,sans-serif;font-size:12.5px;color:#707073;line-height:1.7;">South Jordan, Utah 84095 USA</div>
      <div style="font-family:Inter,sans-serif;font-size:12.5px;color:#707073;line-height:1.7;">Tel +1 801 208 4166</div>
      <div style="font-family:Inter,sans-serif;font-size:12.5px;color:#707073;line-height:1.7;">Mobile +1 801 440 5438</div>
      <div style="font-family:Inter,sans-serif;font-size:12.5px;color:#1C75BC;line-height:1.7;">jordan.francis@merit.com</div>
    </div>
    <div>
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:#C9252C;margin-bottom:8px;">To Place an Order, Contact</div>
      <div style="font-family:Inter,sans-serif;font-size:12.5px;color:#707073;line-height:1.7;">Toll Free 800 637 4839</div>
      <div style="font-family:Inter,sans-serif;font-size:12.5px;color:#707073;line-height:1.7;">Tel +1 801 208 4313</div>
      <div style="font-family:Inter,sans-serif;font-size:12.5px;color:#707073;line-height:1.7;">Fax +1 801 253 6988</div>
      <div style="font-family:Inter,sans-serif;font-size:12.5px;color:#1C75BC;line-height:1.7;">USCSOEM@merit.com</div>
    </div>
  </div>
</div>`;
}

function compactHeader(quoteId: string): string {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:26px 56px 14px;border-bottom:2px solid #C9252C;">
  <img src="${LOGO_DATA_URI}" alt="Merit Medical OEM" style="height:26px;display:block;">
  <div style="text-align:right;">
    <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9A9B9E;">Product Quotation</div>
    <div style="font-family:Outfit,sans-serif;font-weight:700;font-size:15px;color:#C9252C;letter-spacing:-.01em;">${esc(quoteId)}</div>
  </div>
</div>`;
}

function footer(pageLabel: string): string {
  const conf = `<span style="font-family:Inter,sans-serif;font-size:8.5px;letter-spacing:.22em;text-transform:uppercase;color:#B5B6B8;">Confidential Document</span>`;
  return `<div style="margin-top:auto;">
  <div style="background:#C9252C;display:flex;justify-content:space-between;align-items:center;padding:9px 56px;">
    <span style="font-family:Outfit,sans-serif;font-weight:700;font-size:10px;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;color:rgba(255,255,255,.82);">${esc(pageLabel)}</span>
    <span style="font-family:Outfit,sans-serif;font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#fff;white-space:nowrap;">View our product catalog: www.meritoem.com</span>
  </div>
  <div style="display:flex;justify-content:space-between;padding:7px 56px;background:#fff;">${conf}${conf}${conf}</div>
</div>`;
}

function metaBlock(spec: QuoteSpec): string {
  const field = (label: string, value: string) =>
    `<div><div style="font-family:Outfit,sans-serif;font-weight:800;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:#707073;margin-bottom:3px;">${esc(label)}</div><div style="font-family:Inter,sans-serif;font-weight:600;font-size:13px;color:#333335;line-height:1.35;">${esc(value)}</div></div>`;
  return `<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;">
  <div>
    <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#C9252C;">Product Quotation</div>
    <div style="font-family:Outfit,sans-serif;font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9A9B9E;margin-top:3px;">Quotation Number</div>
  </div>
  <div style="font-family:Outfit,sans-serif;font-weight:700;font-size:23px;letter-spacing:-.01em;color:#C9252C;line-height:1;">${esc(spec.quoteId)}</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid #E6E7E8;border-left:3px solid #C9252C;background:#F7F7F8;">
  <div style="padding:14px 18px;display:flex;flex-direction:column;gap:11px;border-right:1px solid #E6E7E8;">${field("Description", spec.description)}${field("Quoted For", spec.quotedFor)}</div>
  <div style="padding:14px 18px;display:flex;flex-direction:column;gap:11px;">${field("Quote Date", spec.quoteDate)}${field("Quoted By", "Jordan Francis")}</div>
</div>
<div style="font-family:Inter,sans-serif;font-style:italic;font-size:10px;color:#9A9B9E;margin-top:6px;">Note: Quote expires 15 days from Quote Date.</div>`;
}

function tableHeaderRow(thBg: string): string {
  const cell = (label: string, first: boolean) =>
    `<div style="padding:10px 8px;display:flex;align-items:center;justify-content:center;${first ? "" : "border-left:1px solid rgba(255,255,255,.16);"}"><span style="font-family:Outfit,sans-serif;font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#fff;text-align:center;">${label}</span></div>`;
  return `<div style="display:grid;grid-template-columns:62px 102px 1fr 80px 94px;background:${thBg};">${cell("Quantity", true)}${cell("Part No.", false)}${cell("Description", false)}${cell("Price/ea.", false)}${cell("Lead Time", false)}</div>`;
}

function lineItemRow(it: QuoteLineItem, rowIndex: number): string {
  const rowBg = rowIndex % 2 === 1 ? "#F7F7F8" : "#FFFFFF";
  const attrs = it.attributes
    .map(
      (a) =>
        `<div style="font-family:Inter,sans-serif;font-size:11px;line-height:1.5;color:#707073;">${esc(a)}</div>`,
    )
    .join("");
  const closing = it.closing
    ? `<div style="font-family:Inter,sans-serif;font-weight:700;font-size:11px;color:#4D4D4F;margin-top:7px;">${esc(it.closing)}</div>`
    : "";
  const lead = it.leadStacked
    ? `<div style="font-family:Inter,sans-serif;font-weight:700;font-size:12px;color:#4D4D4F;">${esc(it.leadStock || "In Stock")}</div><div style="font-family:Inter,sans-serif;font-weight:300;font-size:10px;color:#9A9B9E;">or</div><div style="font-family:Inter,sans-serif;font-weight:700;font-size:12px;color:#4D4D4F;">${esc(it.leadAlt)}</div>`
    : `<div style="font-family:Inter,sans-serif;font-weight:600;font-size:12px;color:#4D4D4F;line-height:1.4;">${esc(it.leadTime)}</div>`;
  return `<div style="display:grid;grid-template-columns:62px 102px 1fr 80px 94px;background:${rowBg};border-top:1px solid #E6E7E8;">
  <div style="padding:13px 8px;display:flex;align-items:center;justify-content:center;"><span style="font-family:Inter,sans-serif;font-weight:700;font-size:14px;color:#4D4D4F;">${esc(formatQuantity(it.quantity))}</span></div>
  <div style="padding:13px 8px;display:flex;align-items:center;justify-content:center;border-left:1px solid #E6E7E8;"><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:${pnFontSize(it.partNo)};color:#4D4D4F;text-align:center;line-height:1.35;overflow-wrap:break-word;">${esc(it.partNo)}</span></div>
  <div style="padding:13px 14px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-left:1px solid #E6E7E8;">
    <div style="font-family:Inter,sans-serif;font-weight:700;font-size:13px;color:#1A1A1C;border-bottom:1.5px solid #C9252C;padding-bottom:3px;margin-bottom:7px;display:inline-block;">${esc(it.title)}</div>${attrs}${closing}
  </div>
  <div style="padding:13px 8px;display:flex;align-items:center;justify-content:center;border-left:1px solid #E6E7E8;"><span style="font-family:Inter,sans-serif;font-weight:700;font-size:14px;color:#4D4D4F;">${esc(formatPrice(it.price))}</span></div>
  <div style="padding:13px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2px;border-left:1px solid #E6E7E8;">${lead}</div>
</div>`;
}

function orderLine(): string {
  return `<div style="text-align:center;margin:20px 0 6px;font-family:Inter,sans-serif;font-weight:700;font-size:13px;color:#1A1A1C;">Please email order to <span style="color:#C9252C;">USCSOEM@merit.com</span> or fax to <span style="color:#C9252C;">+1 801.253.6988</span></div>`;
}

function disclaimer(): string {
  const p = (style: string, text: string) =>
    `<p style="margin:0;font-family:Inter,sans-serif;${style}">${text}</p>`;
  return `<div style="margin-top:14px;border-top:1px solid #E6E7E8;padding-top:14px;display:flex;flex-direction:column;gap:9px;">
  ${p("font-weight:300;font-size:9.5px;line-height:1.65;color:#707073;text-align:justify;", "All products are supplied Bulk, Non-Sterile unless stated otherwise. Products subject to this Proposal are manufactured and packaged in accordance with Merit&#8217;s specifications. Merit disclaims any and all other warranties including but not limited to the implied warranties of merchantability and fitness for a particular purpose, even if Merit is aware of such purpose. Merit makes no claims, regulatory or otherwise, and assumes no responsibility for, the end use of any products.")}
  ${p("font-weight:300;font-size:9.5px;line-height:1.65;color:#707073;text-align:justify;", "Pricing does not include any applicable taxes or shipping fees. NRE fees are due upon acceptance of your order, unless otherwise stated. Actual lead-times for development and qualification projects are estimates and may have unpredictable outcomes.")}
  ${p("font-style:italic;font-weight:400;font-size:9.5px;line-height:1.6;color:#4D4D4F;", "Note: The lead times quoted are for informational purpose only and subject to available raw material and capacity at the time of ordering.")}
  ${p("font-style:italic;font-weight:400;font-size:9.5px;line-height:1.6;color:#4D4D4F;", "Note: PO for NRE and first product order required to begin the project.")}
</div>`;
}

function closingBlock(spec: QuoteSpec): string {
  const summary = spec.leadTimeSummary
    ? `<div style="border:1px solid #E6E7E8;border-left:3px solid #C9252C;background:#F7F7F8;padding:14px 18px;margin-bottom:26px;"><span style="font-family:Inter,sans-serif;font-weight:700;font-size:12.5px;color:#333335;">Note:</span> <span style="font-family:Inter,sans-serif;font-size:12.5px;color:#4D4D4F;line-height:1.5;">${esc(spec.leadTimeSummary)}</span></div>`
    : "";
  return `${summary}
<p style="font-family:Inter,sans-serif;font-size:13px;line-height:1.75;color:#4D4D4F;margin:0 0 30px;max-width:620px;">Thank you for the opportunity to quote <strong style="font-weight:700;color:#1A1A1C;">${esc(spec.customerName)}</strong> on this project. We look forward to years of service as a trusted medical device manufacturer. If you have any questions and/or comments, please don&#8217;t hesitate to contact me personally.</p>
<div style="font-family:Inter,sans-serif;font-size:13px;color:#4D4D4F;margin-bottom:2px;">Respectfully,</div>
<img src="${SIGNATURE_DATA_URI}" alt="Jordan Francis signature" style="height:80px;width:auto;display:block;margin:2px 0 0;">
<div style="width:240px;border-bottom:1px solid #C9CACC;margin-bottom:14px;"></div>
<div style="display:flex;justify-content:space-between;max-width:470px;">
  <div>
    <div style="font-family:Inter,sans-serif;font-weight:700;font-size:13px;color:#1A1A1C;">Jordan Francis</div>
    <div style="font-family:Inter,sans-serif;font-size:12px;color:#707073;line-height:1.55;">Business Development Manager</div>
    <div style="font-family:Inter,sans-serif;font-size:12px;color:#1C75BC;line-height:1.55;">jordan.francis@merit.com</div>
  </div>
  <div style="text-align:right;">
    <div style="font-family:Inter,sans-serif;font-size:12px;color:#707073;line-height:1.55;">Tel +1 801 208 4166</div>
    <div style="font-family:Inter,sans-serif;font-size:12px;color:#707073;line-height:1.55;">Mobile +1 801 440 5438</div>
  </div>
</div>`;
}

// ---- Paginator ------------------------------------------------------------

type Part =
  | { type: "meta"; html: string }
  | { type: "row"; html: string }
  | { type: "order"; html: string }
  | { type: "disclaimer"; html: string }
  | { type: "closing"; html: string };

interface PageDef {
  kind: "first" | "cont";
  remaining: number;
  rowsStarted: boolean;
  parts: Part[];
}

function newPage(kind: "first" | "cont"): PageDef {
  return {
    kind,
    remaining: kind === "first" ? FIRST_REMAINING : CONT_REMAINING,
    rowsStarted: false,
    parts: [],
  };
}

function paginate(spec: QuoteSpec): PageDef[] {
  const pages: PageDef[] = [];
  let cur = newPage("first");
  pages.push(cur);

  // Page 1 always opens with the metadata block.
  cur.parts.push({ type: "meta", html: metaBlock(spec) });
  cur.remaining -= META_H;

  // Line-item rows, each potentially overflowing to a continuation page. The
  // table header counts once per page that carries rows.
  spec.lineItems.forEach((it, i) => {
    const h = estimateRowHeight(it);
    const needHeader = !cur.rowsStarted;
    const needed = (needHeader ? TABLE_HEADER_H : 0) + h;
    if (cur.remaining < needed && cur.parts.length > 0) {
      cur = newPage("cont");
      pages.push(cur);
    }
    if (!cur.rowsStarted) {
      cur.remaining -= TABLE_HEADER_H;
      cur.rowsStarted = true;
    }
    cur.parts.push({ type: "row", html: lineItemRow(it, i) });
    cur.remaining -= h;
  });

  // Trailing blocks in order: order line, disclaimer, closing.
  const trailing: Array<{ part: Part; h: number }> = [
    { part: { type: "order", html: orderLine() }, h: ORDER_LINE_H },
    { part: { type: "disclaimer", html: disclaimer() }, h: DISCLAIMER_H },
    { part: { type: "closing", html: closingBlock(spec) }, h: CLOSING_H },
  ];
  for (const { part, h } of trailing) {
    if (cur.remaining < h && cur.parts.length > 0) {
      cur = newPage("cont");
      pages.push(cur);
    }
    cur.parts.push(part);
    cur.remaining -= h;
  }

  return pages;
}

// Render one page's content area: group consecutive rows into a bordered table
// (header repeats per page); render other blocks standalone.
function renderContent(page: PageDef, thBg: string): string {
  const out: string[] = [];
  let rowBuf: string[] = [];
  let placed = 0;

  const flushRows = () => {
    if (rowBuf.length === 0) return;
    const marginTop = placed > 0 ? "margin-top:18px;" : "";
    out.push(
      `<div style="border:1px solid #E6E7E8;${marginTop}">${tableHeaderRow(thBg)}${rowBuf.join("")}</div>`,
    );
    rowBuf = [];
    placed++;
  };

  for (const part of page.parts) {
    if (part.type === "row") {
      rowBuf.push(part.html);
    } else {
      flushRows();
      out.push(part.html);
      placed++;
    }
  }
  flushRows();

  const pad = page.kind === "first" ? "18px 56px 10px" : "22px 56px 12px";
  return `<div style="flex:1;padding:${pad};">${out.join("\n")}</div>`;
}

function pageLabel(spec: QuoteSpec, i: number, total: number): string {
  return spec.showPageNumbers ? `Page ${i + 1} of ${total}` : "";
}

export interface RenderOptions {
  screen?: boolean; // true => on-screen styling (backdrop + shadow) for preview
}

export function buildQuoteHtml(spec: QuoteSpec, opts: RenderOptions = {}): string {
  const thBg = spec.tableHeaderStyle === "Merit Red" ? "#C9252C" : "#333335";
  const pages = paginate(spec);

  const sections = pages
    .map((page, i) => {
      const header =
        page.kind === "first" ? letterhead() : compactHeader(spec.quoteId);
      const content = renderContent(page, thBg);
      const foot = footer(pageLabel(spec, i, pages.length));
      const screenStyle = opts.screen
        ? "margin:0 auto 28px;box-shadow:0 6px 26px rgba(0,0,0,.16);"
        : "";
      return `<section class="qpage" style="width:${PAGE_W}px;height:${PAGE_H}px;background:#fff;display:flex;flex-direction:column;position:relative;overflow:hidden;${screenStyle}">${header}${content}${foot}</section>`;
    })
    .join("\n");

  const rootStyle = opts.screen
    ? "background:#E4E4E6;padding:30px 0;min-height:100vh;"
    : "background:#fff;";

  const printCss = opts.screen
    ? ""
    : `@page{size:Letter;margin:0;}html,body{margin:0;padding:0;background:#fff;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.qpage{break-after:page;page-break-after:always;}.qpage:last-child{break-after:auto;page-break-after:auto;}`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,600;0,700;1,400&family=Outfit:wght@600;700;800;900&family=JetBrains+Mono:wght@600&display=swap" rel="stylesheet">
<style>html,body{margin:0;}body{font-family:Inter,sans-serif;}${printCss}</style>
</head><body><div id="quote-root" style="${rootStyle}">${sections}</div></body></html>`;
}
