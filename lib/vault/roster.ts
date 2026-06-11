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

  // Team Overrides last: "Name = merit|customer" (name may be a wikilink).
  for (const line of sections.get("Team Overrides") ?? []) {
    const m = line.match(/^[-*]?\s*(.+?)\s*=\s*(merit|customer)\s*$/);
    if (!m) continue;
    let name = m[1].trim();
    const linkMatch = name.match(/\[\[([^\]]+)\]\]/);
    if (linkMatch) name = basenameOf(linkMatch[1]);
    const classification = m[2] as "merit" | "customer";
    const existing = roster.get(name);
    setEntry(roster, {
      name,
      classification,
      account: existing?.account,
    });
  }

  return roster;
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
