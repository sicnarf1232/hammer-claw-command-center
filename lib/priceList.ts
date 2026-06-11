import {
  isVaultConfigured,
  listMarkdownFiles,
  readFiles,
} from "@/lib/github";

// Catalog item parsed from the Merit price list. The exact price-list schema is
// not pinned in docs/02, so this parser is tolerant: it reads any markdown
// table under "300 Merit/Price List/" and maps columns by header name. If the
// real format differs, see PUNCHLIST and tighten this one parser.
export interface CatalogItem {
  partNumber: string;
  description: string;
  unitCost: number | null; // null when the cell is missing or unparseable
  sourceFile: string;
}

const PRICE_LIST_PREFIX = "300 Merit/Price List/";

// Keyword matching (substring on a normalized header) so real-world headers
// like "Part#", "High Price", "Unit Cost", "List Price" all map correctly.
const PART_KEYWORDS = ["part", "sku", "item", "catalog", "model"];
const DESC_KEYWORDS = ["desc", "name", "product"];
const COST_KEYWORDS = ["price", "cost"];

export async function getCatalog(): Promise<CatalogItem[]> {
  if (!isVaultConfigured()) return [];
  const files = (await listMarkdownFiles(PRICE_LIST_PREFIX)).filter((f) =>
    f.path.startsWith(PRICE_LIST_PREFIX),
  );
  if (files.length === 0) return [];
  const contents = await readFiles(files);
  const items: CatalogItem[] = [];
  for (const file of contents) {
    if (!file) continue;
    try {
      items.push(...parsePriceTables(file.content, file.path));
    } catch {
      // Skip a malformed price-list file rather than break the catalog.
    }
  }
  return dedupe(items);
}

export function parsePriceTables(
  content: string,
  sourceFile: string,
): CatalogItem[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const items: CatalogItem[] = [];

  let i = 0;
  while (i < lines.length) {
    if (!isTableRow(lines[i])) {
      i++;
      continue;
    }
    // Found a table header row; next line should be the separator.
    const header = splitRow(lines[i]);
    const sep = lines[i + 1];
    if (!sep || !/^[\s|:-]+$/.test(sep) || !isTableRow(sep)) {
      i++;
      continue;
    }
    const cols = mapColumns(header);
    let j = i + 2;
    if (cols.part === -1) {
      // Not a recognizable price table; skip past it.
      while (j < lines.length && isTableRow(lines[j])) j++;
      i = j;
      continue;
    }
    for (; j < lines.length && isTableRow(lines[j]); j++) {
      const cells = splitRow(lines[j]);
      const partNumber = (cells[cols.part] ?? "").trim();
      if (!partNumber) continue;
      const description = cols.desc >= 0 ? (cells[cols.desc] ?? "").trim() : "";
      const unitCost =
        cols.cost >= 0 ? parseMoney(cells[cols.cost] ?? "") : null;
      items.push({ partNumber, description, unitCost, sourceFile });
    }
    i = j;
  }
  return items;
}

function mapColumns(header: string[]): {
  part: number;
  desc: number;
  cost: number;
} {
  // Normalize: lowercase and strip non-alphanumerics so "Part#" -> "part".
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ""));
  const find = (keywords: string[]) =>
    norm.findIndex((h) => keywords.some((k) => h.includes(k)));
  return {
    part: find(PART_KEYWORDS),
    desc: find(DESC_KEYWORDS),
    cost: find(COST_KEYWORDS),
  };
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function dedupe(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (const it of items) {
    if (seen.has(it.partNumber)) continue;
    seen.add(it.partNumber);
    out.push(it);
  }
  return out;
}
