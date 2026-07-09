import type { TriagedMeeting, TriagedActionItem } from "@/lib/ai";

// Jordan's meeting note template (his Granola template, 2026-07-09): a title
// header block (date, company, topic, customer, attendees) followed by
// TL;DR, Action Items ("- [ ] Owner: task. Due: X"), Key Decisions, Numbers
// That Matter, Watch-Outs, Full Notes. When a pulled note already follows
// this template it passes through VERBATIM into the canonical sections with
// zero AI (it was generated from the raw transcript once; re-parsing loses
// context). Notes that do not follow it get one Opus pass instead.

const SECTION_KEYS = [
  "tldr",
  "action-items",
  "key-decisions",
  "numbers",
  "watchouts",
  "full-notes",
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

// Normalize a line for header detection: strip markdown heading marks, bold,
// emoji and other symbol prefixes, then lowercase.
function normalizeHeader(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/^[^a-zA-Z]+/, "")
    .trim()
    .toLowerCase();
}

function sectionKeyOf(line: string): SectionKey | null {
  const h = normalizeHeader(line);
  if (!h || h.length > 40) return null;
  if (h === "tl;dr" || h === "tldr") return "tldr";
  if (h.startsWith("action items")) return "action-items";
  if (h.startsWith("key decisions")) return "key-decisions";
  if (h.startsWith("numbers that matter")) return "numbers";
  if (h.startsWith("watch-outs") || h.startsWith("watchouts") || h.startsWith("watch outs"))
    return "watchouts";
  if (h.startsWith("full notes")) return "full-notes";
  return null;
}

export function matchesNoteTemplate(md: string): boolean {
  const found = new Set<SectionKey>();
  for (const line of md.split(/\r?\n/)) {
    const key = sectionKeyOf(line);
    if (key) found.add(key);
  }
  return found.has("tldr") && found.has("action-items") && found.size >= 3;
}

export interface ParsedTemplateNote {
  title: string | null;
  date: string | null; // as written in the note, not normalized
  company: string | null;
  topic: string | null;
  account: string | null;
  attendees: string[];
  tldr: string;
  actionItems: Array<{ owner: string | null; text: string; due: string | null }>;
  decisions: string[];
  numbers: string[];
  watchouts: string[];
  fullNotes: string;
}

// Deterministic extraction from a templated note. Pure string work, no AI.
export function parseTemplatedNote(md: string): ParsedTemplateNote {
  const lines = md.split(/\r?\n/);
  const out: ParsedTemplateNote = {
    title: null,
    date: null,
    company: null,
    topic: null,
    account: null,
    attendees: [],
    tldr: "",
    actionItems: [],
    decisions: [],
    numbers: [],
    watchouts: [],
    fullNotes: "",
  };

  // Split into header block + sections.
  const sections = new Map<SectionKey, string[]>();
  let current: SectionKey | null = null;
  const header: string[] = [];
  for (const line of lines) {
    const key = sectionKeyOf(line);
    if (key) {
      current = key;
      if (!sections.has(key)) sections.set(key, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
    else header.push(line);
  }

  // Header block: title is the first heading; meta lines are keyed by emoji
  // or by label.
  for (const line of header) {
    const t = line.trim();
    if (!t) continue;
    if (!out.title && /^#{1,3}\s+/.test(t)) {
      out.title = t.replace(/^#{1,3}\s+/, "").replace(/^[^a-zA-Z0-9[]+/, "").trim() || null;
      continue;
    }
    const val = t.replace(/^[^a-zA-Z0-9[]+/, "").replace(/^\*\*[^*]+\*\*:?\s*/, "").trim();
    if (/📅/.test(t) || /^date\b/i.test(normalizeHeader(t))) out.date = out.date ?? val;
    else if (/🏢/.test(t)) out.company = out.company ?? val;
    else if (/📍/.test(t)) out.topic = out.topic ?? val;
    else if (/🔗/.test(t)) out.account = out.account ?? val;
    else if (/👥/.test(t) || /^attendees\b/i.test(normalizeHeader(t))) {
      out.attendees = val
        .replace(/^\(.*?\)\s*/, "")
        .split(/[,;]/)
        .map((a) => a.trim())
        .filter((a) => a && !a.startsWith("("));
    }
  }

  const text = (key: SectionKey) => (sections.get(key) ?? []).join("\n").trim();
  const bulletsOf = (key: SectionKey) =>
    (sections.get(key) ?? [])
      .map((l) => l.trim())
      .filter((l) => /^[-*•]\s+/.test(l))
      .map((l) => l.replace(/^[-*•]\s+/, "").trim())
      .filter((l) => l && !/^\[.*\]$/.test(l)); // drop template placeholders

  out.tldr = text("tldr").replace(/^\[.*\]$/s, "").trim();
  out.decisions = bulletsOf("key-decisions");
  out.numbers = bulletsOf("numbers");
  out.watchouts = bulletsOf("watchouts");
  out.fullNotes = text("full-notes");

  for (const raw of sections.get("action-items") ?? []) {
    const m = raw.trim().match(/^[-*]\s*\[\s*[xX]?\s*\]\s*(.+)$/);
    if (!m) continue;
    let body = m[1].trim();
    let due: string | null = null;
    const dueMatch = body.match(/\bDue:\s*(.+?)\s*$/i);
    if (dueMatch) {
      due = dueMatch[1].replace(/[.·]$/, "").trim();
      body = body.slice(0, dueMatch.index).replace(/[.,;\s]+$/, "").trim();
    }
    const colon = body.indexOf(":");
    // Owner precedes the first colon and is a shortish name, not a sentence.
    const owner =
      colon > 0 && colon <= 40 && !/\s{2,}/.test(body.slice(0, colon))
        ? body.slice(0, colon).trim()
        : null;
    const taskText = owner ? body.slice(colon + 1).trim() : body;
    if (taskText) out.actionItems.push({ owner, text: taskText, due });
  }

  return out;
}

// Build the pipeline's TriagedMeeting from a parsed template note: same shape
// triageMeeting returns, but with the note's own content verbatim and no AI.
export function triagedFromTemplate(
  parsed: ParsedTemplateNote,
  ctx: {
    fallbackTitle: string | null;
    attendees: string[];
    knownAccounts: string[];
    date: string;
  },
): TriagedMeeting {
  const account = matchAccount(parsed.account ?? parsed.company, ctx.knownAccounts);
  const actionItems: TriagedActionItem[] = parsed.actionItems.map((ai) => {
    const isISO = /^\d{4}-\d{2}-\d{2}$/.test(ai.due ?? "");
    return {
      owner: ai.owner,
      text: ai.text,
      isJordans: /\bjordan\b/i.test(ai.owner ?? ""),
      due: isISO ? ai.due! : undefined,
      dueText: !isISO && ai.due ? ai.due : undefined,
    };
  });
  return {
    workstream: "merit",
    account,
    bucket: account ?? "Internal",
    series: null,
    title:
      parsed.title?.replace(/\s*--.*$/, "").trim() ||
      ctx.fallbackTitle ||
      "Untitled meeting",
    topic: parsed.topic,
    tldr: parsed.tldr || "(no summary captured)",
    actionItems,
    decisions: parsed.decisions,
    numbers: parsed.numbers,
    watchouts: parsed.watchouts,
    fullNotes: parsed.fullNotes ? [{ subsection: "Notes", text: parsed.fullNotes }] : [],
    modelUsed: "none (template pass-through)",
  } as TriagedMeeting;
}

function matchAccount(raw: string | null, known: string[]): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\[\[|\]\]/g, "").trim().toLowerCase();
  if (!cleaned) return null;
  const exact = known.find((k) => k.toLowerCase() === cleaned);
  if (exact) return exact;
  const partial = known.find(
    (k) => cleaned.includes(k.toLowerCase()) || k.toLowerCase().includes(cleaned),
  );
  return partial ?? null;
}
