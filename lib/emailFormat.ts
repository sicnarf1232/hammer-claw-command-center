// Pure email body formatting for the inbox surfaces (2026-07-07 overhaul).
// Turns raw text/HTML bodies into a clean primary message plus optionally the
// quoted history (the "On ... wrote:" tail), so threads read as conversation
// instead of walls of repeated text. No IO; unit-tested.

export function emailHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function collapseWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n +/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Markers that start the quoted history of a reply. Everything from the first
// marker onward is "quoted"; the text above it is the actual new message.
const QUOTE_MARKERS: RegExp[] = [
  /^On .{5,200}(wrote|sent):\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^_{6,}\s*$/m,
  /^From:\s?.+\n(Sent|Date):\s?.+/im,
  /^>{1}\s?.{0,200}$/m, // classic ">"-prefixed quoting
];

export interface SplitBody {
  main: string;
  quoted: string | null;
}

// Split a plain-text email into the fresh message and its quoted history.
// Conservative: when a marker sits at the very top (a pure forward), nothing
// is hidden. The quoted part keeps its own text so a toggle can reveal it.
export function splitQuotedHistory(text: string): SplitBody {
  const cleaned = collapseWhitespace(text);
  if (!cleaned) return { main: "", quoted: null };

  let cut = -1;
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(cleaned);
    if (m && (cut === -1 || m.index < cut)) cut = m.index;
  }
  if (cut <= 0) return { main: cleaned, quoted: null };

  const main = cleaned.slice(0, cut).trim();
  const quoted = cleaned.slice(cut).trim();
  // If stripping the quote leaves nothing meaningful, keep the whole thing.
  if (main.length < 2) return { main: cleaned, quoted: null };
  return { main, quoted: quoted || null };
}

// Full pipeline: prefer text, fall back to HTML, then preview; split quoting.
export function formatEmailBody(input: {
  bodyText?: string | null;
  bodyHtml?: string | null;
  bodyPreview?: string | null;
}): SplitBody {
  const raw = input.bodyText?.trim()
    ? input.bodyText
    : input.bodyHtml?.trim()
      ? emailHtmlToText(input.bodyHtml)
      : (input.bodyPreview ?? "");
  return splitQuotedHistory(raw);
}
