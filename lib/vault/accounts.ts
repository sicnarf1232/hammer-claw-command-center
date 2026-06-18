import { splitFrontmatter } from "./frontmatter";
import type { Account, AccountContact } from "./types";

// Parse a Merit customer account note (300 Merit/Customers/<Name>.md) into a
// typed Account. Pure: takes content + path, returns the structured shape.
// Tolerant of the inconsistent frontmatter across legacy/generated notes.
export function parseAccount(content: string, path: string): Account {
  const { frontmatter, body } = splitFrontmatter(content);
  const raw = frontmatter.raw;

  const fileBase = path.split("/").pop()!.replace(/\.md$/, "");
  const headingName = firstHeading(body);
  const name = str(raw.name) ?? headingName ?? fileBase;

  const account: Account = {
    slug: slugify(fileBase),
    name,
    path,
    workstream: frontmatter.workstream ?? "merit",
    type: frontmatter.type ?? str(raw.type),
    region: str(raw.region),
    stage: str(raw.stage),
    status: frontmatter.status ?? str(raw.status),
    accountNumber: str(raw.account_number) ?? str(raw.accountNumber),
    overview: sectionBody(body, "Overview"),
    situations: bulletTitles(sectionBody(body, "Active Situations")),
    contacts: parseContacts(
      sectionBody(body, "Key contacts") ??
        sectionBody(body, "Contacts") ??
        sectionBody(body, "Key Contacts"),
    ),
    links: wikilinkBasenames(sectionBody(body, "Links")),
  };
  return account;
}

// ---- section helpers ----

function firstHeading(body: string): string | undefined {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : undefined;
}

// Return the text between a `## <name>` heading and the next `## ` heading.
function sectionBody(body: string, name: string): string | undefined {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const re = new RegExp(`^#{2,3}\\s+${escapeRe(name)}\\b`, "i");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return undefined;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (/^#{2,3}\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n").trim() || undefined;
}

// Titles of the top-level bullets in a section. Prefers the leading **bold**
// label of each bullet; falls back to the first clause of the line.
function bulletTitles(section?: string): string[] {
  if (!section) return [];
  const titles: string[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\s*-\s+(.*)$/);
    if (!m) continue;
    const text = m[1].trim();
    if (!text) continue;
    const bold = text.match(/^\*\*(.+?)\*\*/);
    titles.push(bold ? bold[1].trim() : firstClause(text));
  }
  return titles;
}

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/;
const PHONE_RE = /(\(?\+?\d[\d().\-\s]{7,}\d)/;

function parseContacts(section?: string): AccountContact[] {
  if (!section) return [];
  const contacts: AccountContact[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\s*-\s+(.*)$/);
    if (!m) continue;
    const text = m[1].trim();
    if (!text) continue;
    const boldName = text.match(/^\*\*(.+?)\*\*\s*(?:[—,·-]\s*)?(.*)$/);
    const name = boldName ? boldName[1].trim() : firstClause(text);
    const detail = boldName ? boldName[2].trim() : undefined;
    const email = text.match(EMAIL_RE)?.[0];
    const phone = text.match(PHONE_RE)?.[0]?.trim();
    // Title is the detail with the email/phone and separators stripped out.
    let title: string | undefined;
    if (detail) {
      title = stripMd(
        detail
          .replace(EMAIL_RE, "")
          .replace(PHONE_RE, "")
          .replace(/[·,;|]/g, " ")
          .replace(/\s+/g, " ")
          .replace(/^[\s.—–-]+|[\s.—–-]+$/g, "")
          .trim(),
      ) || undefined;
    }
    contacts.push({
      name: stripMd(name),
      detail: detail ? stripMd(detail.replace(/\.$/, "")) || undefined : undefined,
      title,
      email,
      phone,
    });
  }
  return contacts;
}

function wikilinkBasenames(section?: string): string[] {
  if (!section) return [];
  const out: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const base = m[1].split("/").pop()!.trim();
    if (base && !out.includes(base)) out.push(base);
  }
  return out;
}

// ---- small utils ----

function firstClause(s: string): string {
  return s.split(/\s+[—–-]\s+|\.\s|:\s/)[0].trim();
}

function stripMd(s: string): string {
  return s.replace(/\*\*/g, "").replace(/\[\[|\]\]/g, "").trim();
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = typeof v === "string" ? v : String(v);
  return s.trim() || undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
