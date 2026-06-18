import type { Account } from "@/lib/vault/types";

// Phase (Milestone 2, #2 + #3): edit an account note in-app and write it back.
// Surgically updates the managed frontmatter fields (type / region / stage /
// status / account_number), the Overview section body, and rebuilds the
// contacts section from a structured list (name / title / email / phone).
// Everything else in the note is preserved. Pure, so it is unit-tested.

export interface EditableContact {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
}

export interface AccountEdit {
  type?: string;
  region?: string;
  stage?: string;
  status?: string;
  accountNumber?: string;
  overview: string;
  contacts: EditableContact[];
}

const CONTACTS_RE = /^#{2,3}\s+(Key contacts|Key Contacts|Contacts)\b/i;
const OVERVIEW_RE = /^#{2,3}\s+Overview\b/i;

export function accountToEditable(a: Account): AccountEdit {
  return {
    type: a.type,
    region: a.region,
    stage: a.stage,
    status: a.status,
    accountNumber: a.accountNumber,
    overview: a.overview ?? "",
    contacts: a.contacts.map((c) => ({
      name: c.name,
      title: c.title,
      email: c.email,
      phone: c.phone,
    })),
  };
}

export function serializeContact(c: EditableContact): string {
  const parts = [c.title, c.email, c.phone]
    .map((p) => p?.trim())
    .filter(Boolean);
  const tail = parts.length ? ` — ${parts.join(" · ")}` : "";
  return `- **${c.name.trim()}**${tail}`;
}

export function applyAccountEdit(content: string, edit: AccountEdit): string {
  const normalized = content.replace(/\r\n/g, "\n");
  let lines = normalized.split("\n");

  lines = editFrontmatter(lines, edit);

  // Overview: replace the section body, or create the section after the H1.
  const overviewBody = edit.overview.trim();
  lines = replaceOrCreateSection(
    lines,
    OVERVIEW_RE,
    "## Overview",
    overviewBody ? [overviewBody] : [],
    "afterH1",
  );

  // Contacts: rebuild from the structured list (create the section if absent).
  const contactBullets = edit.contacts
    .filter((c) => c.name.trim())
    .map(serializeContact);
  lines = replaceOrCreateSection(
    lines,
    CONTACTS_RE,
    "## Key contacts",
    contactBullets,
    "end",
  );

  return lines.join("\n").replace(/\n*$/, "\n");
}

// ---- frontmatter ----

function editFrontmatter(lines: string[], edit: AccountEdit): string[] {
  let close = -1;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        close = i;
        break;
      }
    }
  }
  if (close === -1) {
    // No frontmatter: build one from the managed fields.
    const inner: string[] = [];
    setFm(inner, "type", edit.type);
    setFm(inner, "region", edit.region);
    setFm(inner, "stage", edit.stage);
    setFm(inner, "status", edit.status);
    setFm(inner, "account_number", edit.accountNumber);
    if (!inner.length) return lines;
    return ["---", ...inner, "---", "", ...lines];
  }

  const inner = lines.slice(1, close);
  setFm(inner, "type", edit.type);
  setFm(inner, "region", edit.region);
  setFm(inner, "stage", edit.stage);
  setFm(inner, "status", edit.status);
  setFm(inner, "account_number", edit.accountNumber);
  return ["---", ...inner, "---", ...lines.slice(close + 1)];
}

// Set, replace, or remove a `key: value` line in the frontmatter block.
function setFm(inner: string[], key: string, value?: string): void {
  const re = new RegExp(`^${key}\\s*:`);
  const idx = inner.findIndex((l) => re.test(l.trim()));
  const v = value?.trim();
  if (!v) {
    if (idx >= 0) inner.splice(idx, 1);
    return;
  }
  const line = `${key}: ${yaml(v)}`;
  if (idx >= 0) inner[idx] = line;
  else inner.push(line);
}

// ---- sections ----

// Replace the body of the section matched by `re`, or create it. The heading
// line itself is preserved when found; only its body (up to the next heading)
// is replaced. `place` controls where a missing section is inserted.
function replaceOrCreateSection(
  lines: string[],
  re: RegExp,
  headingText: string,
  bodyLines: string[],
  place: "afterH1" | "end",
): string[] {
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      headingIdx = i;
      break;
    }
  }

  const block = bodyLines.length ? ["", ...bodyLines, ""] : [""];

  if (headingIdx >= 0) {
    let end = lines.length;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (/^#{1,3}\s+/.test(lines[i])) {
        end = i;
        break;
      }
    }
    return [...lines.slice(0, headingIdx + 1), ...block, ...lines.slice(end)];
  }

  // Not found: create it. Skip creating an empty section.
  if (!bodyLines.length) return lines;
  const section = [headingText, ...block];
  if (place === "afterH1") {
    const h1 = lines.findIndex((l) => /^#\s+/.test(l));
    if (h1 >= 0) {
      const insertAt = h1 + 1;
      return [...lines.slice(0, insertAt), "", ...section, ...lines.slice(insertAt)];
    }
  }
  const out = [...lines];
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return [...out, "", ...section];
}

function yaml(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
