import { parseAllWikilinks, basenameOf } from "./wikilink";
import type { Roster, RosterEntry } from "./types";

// Parse memory/context/merit.md into a name -> {merit|customer} map.
// Order of application matters: Leadership + Merit Internal People, then
// Customer Contacts, then Team Overrides applied LAST and authoritatively.
export function parseRoster(content: string): Roster {
  const text = content.replace(/\r\n/g, "\n");
  const sections = splitSections(text);
  const roster: Roster = new Map();

  const meritSections = ["Leadership", "Merit Internal People"];
  for (const heading of meritSections) {
    for (const line of sections.get(heading) ?? []) {
      for (const link of parseAllWikilinks(line)) {
        setEntry(roster, { name: link.basename, classification: "merit" });
      }
    }
  }

  for (const line of sections.get("Customer Contacts") ?? []) {
    const links = parseAllWikilinks(line);
    if (links.length === 0) continue;
    const name = links[0].basename;
    // A trailing ([[Account]]) marks the customer's account.
    const accountMatch = line.match(/\(\s*\[\[([^\]]+)\]\]\s*\)/);
    const account = accountMatch ? basenameOf(accountMatch[1]) : undefined;
    setEntry(roster, { name, classification: "customer", account });
  }

  // Team Overrides last: "Name = merit|customer", with an optional account for
  // customers: "Name = customer ([[Account]])". Name may be a wikilink. Applied
  // authoritatively, so this is what the in-app person editor writes.
  for (const line of sections.get("Team Overrides") ?? []) {
    const m = line.match(
      /^[-*]?\s*(.+?)\s*=\s*(merit|customer)\s*(?:\(\s*\[\[([^\]]+)\]\]\s*\))?\s*$/,
    );
    if (!m) continue;
    let name = m[1].trim();
    const linkMatch = name.match(/\[\[([^\]]+)\]\]/);
    if (linkMatch) name = basenameOf(linkMatch[1]);
    const classification = m[2] as "merit" | "customer";
    const overrideAccount = m[3] ? basenameOf(m[3]) : undefined;
    const existing = roster.get(name);
    setEntry(roster, {
      name,
      classification,
      account:
        classification === "customer"
          ? (overrideAccount ?? existing?.account)
          : undefined,
    });
  }

  return roster;
}

// Add or update a person's authoritative Team Override line (classification and,
// for customers, their account). Pure: takes the roster file content, returns
// the new content. Used by the in-app person editor.
export function setPersonOverride(
  content: string,
  name: string,
  classification: "merit" | "customer",
  account?: string,
): string {
  const text = content.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const newLine = `- ${name} = ${classification}${
    classification === "customer" && account ? ` ([[${account}]])` : ""
  }`;

  let heading = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Team Overrides/i.test(lines[i])) {
      heading = i;
      break;
    }
  }
  if (heading === -1) {
    return text.replace(/\n*$/, "\n") + `\n## Team Overrides\n${newLine}\n`;
  }

  let end = lines.length;
  for (let i = heading + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }

  const matchesName = (line: string): boolean => {
    const mm = line.match(/^[-*]?\s*(.+?)\s*=\s*(merit|customer)\b/);
    if (!mm) return false;
    let ln = mm[1].trim();
    const lk = ln.match(/\[\[([^\]]+)\]\]/);
    if (lk) ln = basenameOf(lk[1]);
    return ln.toLowerCase() === name.toLowerCase();
  };

  let lastOverride = -1;
  for (let i = heading + 1; i < end; i++) {
    if (matchesName(lines[i])) {
      lines[i] = newLine;
      return lines.join("\n");
    }
    if (/^[-*]?\s*.+?\s*=\s*(merit|customer)\b/.test(lines[i])) lastOverride = i;
  }
  const insertAt = lastOverride >= 0 ? lastOverride + 1 : heading + 1;
  lines.splice(insertAt, 0, newLine);
  return lines.join("\n");
}

function setEntry(roster: Roster, entry: RosterEntry): void {
  roster.set(entry.name, entry);
}

// Split a markdown doc into a map of H2 heading text -> the lines beneath it.
function splitSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  const lines = text.split("\n");
  let current: string | null = null;
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = h[1].trim();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
  }
  return sections;
}

// Classify a single attendee name. Unknown names return undefined (callers
// render these gray/unclassified) rather than throwing.
export function classifyName(
  roster: Roster,
  name: string,
): RosterEntry | undefined {
  return roster.get(name.trim()) ?? roster.get(basenameOf(name.trim()));
}

// Distinct customer account names known to the roster (for subject matching).
export function rosterAccounts(roster: Roster): string[] {
  const set = new Set<string>();
  for (const entry of roster.values()) {
    if (entry.account) set.add(entry.account);
  }
  return [...set];
}
