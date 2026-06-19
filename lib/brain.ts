import {
  getOpenTasks,
  getMeetingsIndex,
  getMeetingNoteByPath,
  getRoster,
} from "@/lib/vault";
import { listAccounts } from "@/lib/accounts";
import { customerContacts } from "@/lib/accounts";
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
  const [openTasks, accounts, meetings, roster] = await Promise.all([
    getOpenTasks().catch(() => [] as Task[]),
    listAccounts().catch(() => [] as Account[]),
    getMeetingsIndex().catch(() => []),
    getRoster().catch(() => new Map() as Roster),
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

  return { context: lines.join("\n"), sources };
}
