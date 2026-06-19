import {
  getOpenTasks,
  getMeetingsIndex,
  getMeetingNoteByPath,
  getRoster,
} from "@/lib/vault";
import { listMarkdownFiles, readFiles } from "@/lib/github";
import { listAccounts } from "@/lib/accounts";
import { customerContacts } from "@/lib/accounts";
import { getCatalog, type CatalogItem } from "@/lib/priceList";
import { toTaskView, buildAccountLookup } from "@/lib/taskView";
import type { Account, Task } from "@/lib/vault/types";
import type { Roster } from "@/lib/vault/types";

// Phase (Milestone 2, #5): the "brain". Assemble a grounded, bounded context
// from the live vault for a user question, so the AI answers as the Merit OEM
// team's reference assistant from real data (never invented). The keyword
// selection is pure and unit-tested; the fetch/format is here.

const MAX_NOTE_CHARS = 2200;

// Pure: rank items by how many question keywords appear in their search text.
// Returns the indexes of the top `limit` items with at least one hit.
export function pickRelevant(
  question: string,
  searchTexts: string[],
  limit: number,
): number[] {
  const words = keywords(question);
  if (words.length === 0) return [];
  const scored = searchTexts.map((text, i) => {
    const hay = text.toLowerCase();
    let score = 0;
    for (const w of words) if (hay.includes(w)) score++;
    return { i, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.i);
}

const STOP = new Set([
  "the", "and", "for", "with", "what", "whats", "when", "where", "which", "who",
  "how", "why", "are", "any", "all", "our", "this", "that", "from", "have", "has",
  "about", "into", "out", "get", "give", "tell", "show", "list", "does", "did",
  "was", "were", "will", "should", "would", "can", "could", "account", "accounts",
  "task", "tasks", "meeting", "meetings", "open", "due",
]);

function keywords(q: string): string[] {
  return Array.from(
    new Set(
      q
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w)),
    ),
  );
}

// Does the question look like it is about pricing or a specific part? Used to
// decide whether to include catalog matches (the catalog is large, so we only
// pull it in when relevant).
const PRICE_RE = /\b(price|pricing|cost|costs|quote|catalog|part|sku|how much|list price|unit)\b/i;
const PARTNUM_RE = /\b([A-Za-z]*\d[A-Za-z0-9]{2,}|[A-Za-z]{2,}\d[A-Za-z0-9]*)\b/;

export function isPricingQuestion(q: string): boolean {
  return PRICE_RE.test(q) || PARTNUM_RE.test(q);
}

// Pure: match catalog items to the question. A part-number token in the question
// that matches a part number scores highest; description keyword overlap adds.
export function matchCatalog(
  question: string,
  items: CatalogItem[],
  limit: number,
): CatalogItem[] {
  const words = keywords(question);
  const rawTokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length && !rawTokens.length) return [];

  const scored = items.map((it) => {
    const part = it.partNumber.toLowerCase();
    const desc = it.description.toLowerCase();
    let score = 0;
    for (const tok of rawTokens) {
      if (tok.length >= 3 && (part === tok || part.includes(tok))) score += 5;
    }
    for (const w of words) {
      if (desc.includes(w)) score += 1;
    }
    return { it, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.it);
}

// Pure: pick the best snippet from a note body for the question. Returns the
// keyword-hit count and a trimmed window of lines around the densest match.
export function bestSnippet(
  question: string,
  content: string,
  windowChars = 600,
): { score: number; snippet: string } {
  const words = keywords(question);
  if (!words.length) return { score: 0, snippet: "" };
  const body = content
    .replace(/^---[\s\S]*?\n---\n/, "") // drop frontmatter
    .replace(/\r\n/g, "\n");
  const lower = body.toLowerCase();

  let score = 0;
  let firstHit = -1;
  for (const w of words) {
    let idx = lower.indexOf(w);
    if (idx === -1) continue;
    while (idx !== -1) {
      score++;
      idx = lower.indexOf(w, idx + w.length);
    }
    if (firstHit === -1 || lower.indexOf(w) < firstHit) firstHit = lower.indexOf(w);
  }
  if (score === 0) return { score: 0, snippet: "" };

  const start = Math.max(0, firstHit - 120);
  const snippet = body
    .slice(start, start + windowChars)
    .replace(/\n{2,}/g, "\n")
    .trim();
  return { score, snippet };
}

function taskLine(t: ReturnType<typeof toTaskView>): string {
  const bits = [`- ${t.title.replace(/\[[A-Za-z][\w-]*::[^\]]*\]/g, "").trim()}`];
  const tags: string[] = [];
  if (t.customer && t.customer !== "internal") tags.push(t.customer);
  if (t.type) tags.push(t.type);
  if (t.due) tags.push(`due ${t.due}`);
  if (t.priority) tags.push(t.priority);
  if (t.taskStatus) tags.push(t.taskStatus);
  if (t.workstream && t.workstream !== "merit") tags.push(String(t.workstream));
  if (tags.length) bits.push(`(${tags.join(", ")})`);
  return bits.join(" ");
}

function accountLine(a: Account, roster: Roster): string {
  const contacts = customerContacts(a.contacts, roster);
  const bits = [`- ${a.name}`];
  const tags: string[] = [];
  if (a.accountNumber) tags.push(`#${a.accountNumber}`);
  if (a.type) tags.push(a.type);
  if (a.region) tags.push(a.region);
  if (contacts.length) tags.push(`${contacts.length} contacts`);
  if (tags.length) bits.push(`(${tags.join(", ")})`);
  return bits.join(" ");
}

// Build the grounded context blob plus a short list of the sources used.
export async function assembleBrainContext(question: string): Promise<{
  context: string;
  sources: string[];
}> {
  const pricing = isPricingQuestion(question);
  const [openTasks, accounts, meetings, roster, catalog] = await Promise.all([
    getOpenTasks().catch(() => [] as Task[]),
    listAccounts().catch(() => [] as Account[]),
    getMeetingsIndex().catch(() => []),
    getRoster().catch(() => new Map() as Roster),
    pricing ? getCatalog().catch(() => [] as CatalogItem[]) : Promise.resolve([] as CatalogItem[]),
  ]);

  const lookup = buildAccountLookup(accounts);
  const views = openTasks
    .map((t) => toTaskView(t, lookup))
    .filter((t) => t.workstream !== "nextech");

  const sources: string[] = [];
  const lines: string[] = [];

  // Accounts roster (compact).
  lines.push(`ACCOUNTS (${accounts.length}):`);
  lines.push(...accounts.map((a) => accountLine(a, roster)));
  lines.push("");

  // Open Merit tasks (trimmed).
  const merit = views.filter((t) => t.workstream === "merit" || !t.workstream);
  lines.push(`OPEN MERIT TASKS (${merit.length}, showing up to 60):`);
  lines.push(...merit.slice(0, 60).map(taskLine));
  lines.push("");

  // Meetings index (recent).
  lines.push(`RECENT MEETINGS (${meetings.length}, showing up to 30):`);
  lines.push(...meetings.slice(0, 30).map((m) => `- ${m.date} ${m.title} [${m.bucket}]`));
  lines.push("");

  // Keyword retrieval: pull the bodies of the most relevant meeting notes and
  // account notes so detailed questions are answered from the real content.
  const meetingTexts = meetings.map((m) => `${m.title} ${m.bucket} ${m.date}`);
  const relMeetings = pickRelevant(question, meetingTexts, 3);
  for (const i of relMeetings) {
    const m = meetings[i];
    if (!m.notePath) continue;
    const note = await getMeetingNoteByPath(m.notePath).catch(() => null);
    if (!note) continue;
    const body = [
      note.sections["TL;DR"] ? `TL;DR: ${note.sections["TL;DR"]}` : "",
      note.sections["Key Decisions"] ? `Decisions: ${note.sections["Key Decisions"]}` : "",
      note.actionItems.length
        ? `Action items: ${note.actionItems.map((a) => `${a.owner ? a.owner + ": " : ""}${a.text}${a.due ? ` (due ${a.due})` : ""}`).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_NOTE_CHARS);
    lines.push(`MEETING NOTE: ${note.title} (${note.date})`, body, "");
    sources.push(`Meeting: ${m.title} (${m.date})`);
  }

  const accountTexts = accounts.map(
    (a) => `${a.name} ${a.region ?? ""} ${a.contacts.map((c) => c.name).join(" ")}`,
  );
  const relAccounts = pickRelevant(question, accountTexts, 3);
  for (const i of relAccounts) {
    const a = accounts[i];
    const contacts = customerContacts(a.contacts, roster);
    const body = [
      a.overview ? `Overview: ${a.overview}` : "",
      a.situations.length ? `Active situations: ${a.situations.join("; ")}` : "",
      contacts.length
        ? `Contacts: ${contacts.map((c) => `${c.name}${c.title ? ` (${c.title})` : ""}${c.email ? ` ${c.email}` : ""}`).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_NOTE_CHARS);
    if (body) {
      lines.push(`ACCOUNT NOTE: ${a.name}`, body, "");
      sources.push(`Account: ${a.name}`);
    }
  }

  // Pricing: include matching catalog parts (your price) when the question is
  // about pricing or names a part. The same catalog the quote builder uses.
  if (pricing && catalog.length) {
    const hits = matchCatalog(question, catalog, 12);
    if (hits.length) {
      lines.push(`CATALOG PRICING (${hits.length} matches of ${catalog.length} parts):`);
      lines.push(
        ...hits.map(
          (h) =>
            `- ${h.partNumber}: ${h.description}${h.unitCost != null ? ` = $${h.unitCost.toLocaleString("en-US")}` : " (no price listed)"}`,
        ),
      );
      lines.push("");
      sources.push("Merit price list");
    }
  }

  // Vault-wide scan: search the rest of the vault (projects, people, sales ops,
  // periodics, memory, etc.) for notes relevant to the question, so the brain
  // draws on everything, not just the structured types above.
  const scanned = await scanVaultNotes(question, 4);
  for (const s of scanned) {
    lines.push(`VAULT NOTE: ${s.path}`, s.snippet, "");
    sources.push(`Note: ${s.path.split("/").pop()}`);
  }

  return { context: lines.join("\n"), sources };
}

// Directories already covered by structured retrieval above, or that are noise.
// Everything else in the vault is fair game for the keyword scan.
const SCAN_EXCLUDES = [
  "000 OS/",
  "200 Dashboards/",
  "900 Archive/",
  "400 Nextech/",
  "300 Merit/Customers/",
  "300 Merit/Price List/",
];

async function scanVaultNotes(
  question: string,
  limit: number,
): Promise<{ path: string; snippet: string }[]> {
  const files = (await listMarkdownFiles().catch(() => [])).filter(
    (f) =>
      !SCAN_EXCLUDES.some((p) => f.path.startsWith(p)) &&
      !f.path.includes("/Meetings/"), // meetings are retrieved above
  );
  if (!files.length) return [];

  const contents = await readFiles(files).catch(() => []);
  const scored = contents
    .filter(Boolean)
    .map((f) => {
      const { score, snippet } = bestSnippet(question, f.content);
      return { path: f.path, score, snippet };
    })
    .filter((s) => s.score > 0 && s.snippet)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => ({ path: s.path, snippet: s.snippet }));
}
