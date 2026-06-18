// Phase B: pure transform to add contacts to a customer account note's contacts
// section, matching the vault contract the account parser reads ("Key contacts"
// / "Contacts" / "Key Contacts", bullets like "- **Name** — detail"). Adding a
// contact is surgical: existing lines are preserved; only new bullets are
// appended into the section (the section is created if missing). Deduped by a
// normalized name so re-running is safe. No network here, so it is unit-tested.

export interface NewContact {
  name: string;
  email?: string;
}

export interface AddContactsResult {
  content: string;
  added: string[]; // names actually appended
}

const SECTION_RE = /^#{2,3}\s+(Key contacts|Key Contacts|Contacts)\b/i;

export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[\[|\]\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Pull the contact name out of a "- **Name** — detail" (or "- Name, detail")
// bullet, mirroring the account parser's leniency.
function bulletName(line: string): string | null {
  const m = line.match(/^\s*-\s+(.*)$/);
  if (!m || !m[1].trim()) return null;
  const text = m[1].trim();
  const bold = text.match(/^\*\*(.+?)\*\*/);
  if (bold) return bold[1].trim();
  return text.split(/\s+[—–-]\s+|,\s|:\s/)[0].trim();
}

function bulletFor(c: NewContact): string {
  const name = c.name.trim();
  return c.email ? `- **${name}** — ${c.email.trim()}` : `- **${name}**`;
}

export function addContactsToNote(
  content: string,
  contacts: NewContact[],
): AddContactsResult {
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  // Find the contacts section and its line range [start, end).
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SECTION_RE.test(lines[i])) {
      headingIdx = i;
      break;
    }
  }
  let sectionEnd = lines.length;
  if (headingIdx >= 0) {
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (/^#{1,3}\s+/.test(lines[i])) {
        sectionEnd = i;
        break;
      }
    }
  }

  // Existing names (within the section if present, else whole doc as a guard).
  const existing = new Set<string>();
  const scanFrom = headingIdx >= 0 ? headingIdx + 1 : 0;
  const scanTo = headingIdx >= 0 ? sectionEnd : lines.length;
  for (let i = scanFrom; i < scanTo; i++) {
    const n = bulletName(lines[i]);
    if (n) existing.add(normName(n));
  }

  // De-dupe the input against existing and against itself.
  const seen = new Set(existing);
  const toAdd: NewContact[] = [];
  for (const c of contacts) {
    const key = normName(c.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    toAdd.push(c);
  }
  if (toAdd.length === 0) {
    return { content: lines.join("\n"), added: [] };
  }

  const newBullets = toAdd.map(bulletFor);
  const added = toAdd.map((c) => c.name.trim());

  if (headingIdx === -1) {
    // No contacts section: append one at the end of the file.
    const out = [...lines];
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    out.push("", "## Key contacts", "", ...newBullets, "");
    return { content: out.join("\n"), added };
  }

  // Insert after the last bullet in the section, or directly under the heading
  // when the section has no bullets yet.
  let insertAt = headingIdx + 1;
  for (let i = headingIdx + 1; i < sectionEnd; i++) {
    if (/^\s*-\s+/.test(lines[i])) insertAt = i + 1;
  }
  const out = [...lines.slice(0, insertAt), ...newBullets, ...lines.slice(insertAt)];
  return { content: out.join("\n"), added };
}
