// Extract tabular data from email HTML. When someone pastes an Excel range into
// an email, it arrives as an HTML <table> and the plain-text alternative usually
// loses the structure, so the brain and the AI never see the numbers. This turns
// each <table> into readable "cell | cell" rows so the data is captured.

function decode(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function cellText(cell: string): string {
  return decode(
    cell
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

// Convert all <table> blocks in an HTML string into text. Returns "" if none.
export function htmlTablesToText(html: string): string {
  if (!html || !/<table/i.test(html)) return "";
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  const out: string[] = [];

  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const lines: string[] = [];
    for (const row of rows) {
      const cells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? [];
      const values = cells.map(cellText);
      // Skip rows that are entirely empty.
      if (values.some((v) => v)) lines.push(values.join(" | "));
    }
    if (lines.length) out.push(lines.join("\n"));
  }

  return out.join("\n\n").slice(0, 40_000);
}
