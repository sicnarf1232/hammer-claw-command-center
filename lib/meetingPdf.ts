import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ShareDoc, ShareAction } from "@/lib/meetingShare";

// Phase D: a branded Film Room PDF of a meeting note or rolling series, built
// from the shared ShareDoc model (lib/meetingShare). Multi-page flow with a
// running footer. House style: no em dashes; all text is sanitized to the
// WinAnsi range the standard fonts can encode (emoji etc. are dropped).

const ACCENT = rgb(0.31, 0.27, 0.9); // indigo ~#4f46e5
const INK = rgb(0.12, 0.15, 0.2);
const BODY = rgb(0.3, 0.34, 0.4);
const MUTED = rgb(0.42, 0.45, 0.5);
const WARM = rgb(0.7, 0.32, 0.04); // amber ~#b45309
const OK = rgb(0.16, 0.6, 0.32);

const PAGE: [number, number] = [612, 792]; // US Letter
const M = 54;
const RIGHT = PAGE[0] - M;
const WIDTH = RIGHT - M;
const BOTTOM = 64;

interface Ctx {
  pdf: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
}

export async function buildMeetingPdf(doc: ShareDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = { pdf, font, bold, page: pdf.addPage(PAGE), y: PAGE[1] - M };
  drawTitle(ctx, doc);

  for (const b of doc.blocks) {
    if (b.type === "tldr") {
      heading(ctx, b.label);
      paragraph(ctx, b.text, 11, INK);
    } else if (b.type === "actions") {
      heading(ctx, "Action Items");
      if (!b.items.length) paragraph(ctx, "None captured.", 10, MUTED);
      for (const it of b.items) drawAction(ctx, it);
    } else if (b.type === "bullets") {
      heading(ctx, b.heading);
      for (const it of b.items) bullet(ctx, it);
    } else if (b.type === "prose") {
      heading(ctx, b.heading);
      for (const line of b.text.split("\n")) {
        const sub = line.match(/^###\s+(.+?)\s*$/);
        if (sub) {
          ensure(ctx, 18);
          ctx.y -= 4;
          drawText(ctx, sub[1], M, 10.5, ctx.bold, INK);
          ctx.y -= 16;
        } else if (line.trim()) {
          paragraph(ctx, line, 10, BODY, 13);
        }
      }
    } else if (b.type === "log") {
      heading(ctx, b.heading);
      for (const e of b.entries) drawLogEntry(ctx, e);
    }
  }

  stampFooters(ctx);
  return pdf.save();
}

// ---- layout primitives ----

function newPage(ctx: Ctx) {
  ctx.page = ctx.pdf.addPage(PAGE);
  ctx.y = PAGE[1] - M;
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < BOTTOM) newPage(ctx);
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  size: number,
  f: PDFFont,
  color = INK,
) {
  ctx.page.drawText(clean(text), { x, y: ctx.y, size, font: f, color });
}

function drawTitle(ctx: Ctx, doc: ShareDoc) {
  drawText(ctx, "FILM ROOM", M, 9, ctx.bold, ACCENT);
  ctx.y -= 18;
  for (const tl of wrap(doc.title, ctx.bold, 22, WIDTH)) {
    ensure(ctx, 26);
    drawText(ctx, tl, M, 22, ctx.bold, INK);
    ctx.y -= 26;
  }
  if (doc.subtitle) {
    drawText(ctx, doc.subtitle, M, 11, ctx.font, MUTED);
    ctx.y -= 16;
  }
  for (const m of doc.meta) {
    const label = `${m.label}: `;
    ensure(ctx, 14);
    drawText(ctx, label, M, 10, ctx.bold, INK);
    const lx = M + ctx.bold.widthOfTextAtSize(clean(label), 10);
    const lines = wrap(m.value, ctx.font, 10, RIGHT - lx);
    drawText(ctx, lines[0] ?? "", lx, 10, ctx.font, BODY);
    ctx.y -= 14;
    for (const extra of lines.slice(1)) {
      ensure(ctx, 14);
      drawText(ctx, extra, lx, 10, ctx.font, BODY);
      ctx.y -= 14;
    }
  }
  ctx.y -= 4;
  ctx.page.drawRectangle({ x: M, y: ctx.y, width: WIDTH, height: 2, color: ACCENT });
  ctx.y -= 14;
}

function heading(ctx: Ctx, title: string) {
  ensure(ctx, 30);
  ctx.y -= 12;
  drawText(ctx, title.toUpperCase(), M, 10, ctx.bold, MUTED);
  ctx.y -= 16;
}

function paragraph(ctx: Ctx, text: string, size: number, color = INK, lh = 15) {
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      ctx.y -= lh * 0.5;
      continue;
    }
    for (const wl of wrap(line, ctx.font, size, WIDTH)) {
      ensure(ctx, lh);
      drawText(ctx, wl, M, size, ctx.font, color);
      ctx.y -= lh;
    }
  }
  ctx.y -= 3;
}

function bullet(ctx: Ctx, text: string) {
  const indent = M + 14;
  const lines = wrap(text, ctx.font, 10.5, RIGHT - indent);
  ensure(ctx, 15);
  ctx.page.drawRectangle({ x: M + 1, y: ctx.y + 1, width: 4.5, height: 4.5, color: ACCENT });
  drawText(ctx, lines[0] ?? "", indent, 10.5, ctx.font, INK);
  ctx.y -= 15;
  for (const extra of lines.slice(1)) {
    ensure(ctx, 15);
    drawText(ctx, extra, indent, 10.5, ctx.font, INK);
    ctx.y -= 15;
  }
}

function drawAction(ctx: Ctx, it: ShareAction) {
  const indent = M + 18;
  const prefix = it.owner ? `${it.owner}: ` : "";
  const lines = wrap(prefix + it.text, ctx.font, 10.5, RIGHT - indent - 4);
  ensure(ctx, 15);
  drawText(ctx, it.done ? "[x]" : "[ ]", M, 10.5, ctx.bold, it.done ? OK : MUTED);
  lines.forEach((wl, i) => {
    if (i > 0) ensure(ctx, 14);
    if (i === 0 && prefix && wl.startsWith(prefix)) {
      drawText(ctx, prefix, indent, 10.5, ctx.bold, ACCENT);
      const px = indent + ctx.bold.widthOfTextAtSize(clean(prefix), 10.5);
      drawTextAt(ctx, wl.slice(prefix.length), px, 10.5, ctx.font, INK);
    } else {
      drawText(ctx, wl, indent, 10.5, ctx.font, INK);
    }
    ctx.y -= 14;
  });
  const dueTag = it.flag
    ? `needs due date${it.due && it.due.toLowerCase() !== "tbd" ? ": " + it.due : ""}`
    : it.due
      ? `due ${it.due}`
      : "";
  if (dueTag) {
    ensure(ctx, 13);
    drawText(ctx, dueTag, indent, 9, ctx.font, it.flag ? WARM : MUTED);
    ctx.y -= 14;
  }
  ctx.y -= 3;
}

// Draw at an explicit x without resetting y (used for inline runs).
function drawTextAt(
  ctx: Ctx,
  text: string,
  x: number,
  size: number,
  f: PDFFont,
  color = INK,
) {
  ctx.page.drawText(clean(text), { x, y: ctx.y, size, font: f, color });
}

function drawLogEntry(ctx: Ctx, e: { heading: string; text: string }) {
  ensure(ctx, 24);
  ctx.y -= 4;
  drawText(ctx, e.heading, M, 11, ctx.bold, INK);
  ctx.y -= 16;
  paragraph(ctx, e.text, 10, BODY, 13);
}

function stampFooters(ctx: Ctx) {
  const pages = ctx.pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText("Film Room  .  Confidential  .  Hammer Claw Vault", {
      x: M,
      y: 40,
      size: 8,
      font: ctx.font,
      color: MUTED,
    });
    const label = `${i + 1} / ${pages.length}`;
    const w = ctx.font.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: RIGHT - w, y: 40, size: 8, font: ctx.font, color: MUTED });
  });
}

// ---- text safety ----

// Sanitize to what the standard PDF fonts (WinAnsi) can encode, and apply the
// house no-em-dash rule. Anything outside the safe range is dropped (emoji etc).
function clean(s: string): string {
  return s
    .replace(/[—–]/g, "-")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[•◆▪·→←]/g, "-")
    .replace(/[^\x09\x0A\x20-\x7E¡-ÿ]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
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
