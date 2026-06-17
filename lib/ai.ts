import Anthropic from "@anthropic-ai/sdk";
import { identityFor } from "@/lib/workstreams";
import {
  isWorkstream,
  type Priority,
  type Workstream,
} from "@/lib/vault/types";

// AI drafting for email replies (Phase 2) and briefs (Phase 4). Optional:
// without ANTHROPIC_API_KEY the app skips AI and Jordan writes the body himself.

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. AI drafting is unavailable.");
    this.name = "AiNotConfiguredError";
  }
}

function model(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  if (_client) return _client;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Strip em dashes from generated content (house style, CLAUDE.md rule 7).
function noEmDash(s: string): string {
  return s.replace(/—/g, ", ");
}

export interface DraftReplyInput {
  fromName?: string | null;
  fromEmail?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  workstream: Workstream;
  instructions?: string; // optional steer from Jordan ("decline politely", etc.)
}

// Draft a reply body (plain text). The route appends the signature and wraps to
// HTML; this returns only the message body Jordan will review and edit.
export async function draftReply(input: DraftReplyInput): Promise<string> {
  const identity = identityFor(input.workstream);
  const brand = identity.brand ?? identity.label;

  const system = [
    "You draft email replies for Jordan Francis. Jordan reviews and sends every draft, so write a complete, ready-to-send reply body.",
    `This reply is sent from Jordan's ${brand} identity.`,
    "House style rules, follow exactly:",
    "- Never use em dashes. Use commas, colons, or periods.",
    "- Plain, direct, professional. No filler, no marketing voice.",
    "- Do not invent facts, prices, dates, part numbers, or commitments. If something is unknown, leave a clear bracketed placeholder like [confirm date].",
    "Output only the reply body. No subject line, no greeting metadata, no signature block, no preamble, and no commentary about the draft.",
  ].join("\n");

  const parts = [
    `Incoming email from ${input.fromName ?? input.fromEmail ?? "the sender"}${
      input.fromEmail ? ` <${input.fromEmail}>` : ""
    }.`,
    `Subject: ${input.subject ?? "(no subject)"}`,
    "",
    "Message:",
    input.bodyText?.trim() || "(no body text was captured)",
  ];
  if (input.instructions?.trim()) {
    parts.push("", `Jordan's instruction for this reply: ${input.instructions.trim()}`);
  }
  parts.push("", "Write the reply body now.");

  const res = await client().messages.create({
    model: model(),
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: parts.join("\n") }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return noEmDash(text);
}

// ---- Meeting triage (Granola pull) ----

export interface TriagedActionItem {
  owner: string | null; // "Jordan" for Jordan's items, the person's name otherwise
  text: string; // action text, owner prefix stripped
  isJordans: boolean; // true => render with a field row, surfaces as a real task
  priority?: Priority;
  due?: string; // YYYY-MM-DD if the meeting set one
}

export interface FullNotesSection {
  subsection: string; // a "### " heading under Full Notes
  text: string; // prose / bullets for that subsection
}

export interface TriagedMeeting {
  workstream: Workstream; // merit | sloan | personal | shared
  account: string | null; // customer/account display name, e.g. "MicroVention Terumo"
  bucket: string; // Meetings-Index bucket, e.g. "Terumo" or "Internal"
  series: string | null; // recurring series name if evident, else null
  title: string; // clean meeting title (no date, no customer prefix)
  topic: string | null; // one-line topic for the meta line
  tldr: string; // 2-4 sentence summary
  actionItems: TriagedActionItem[];
  decisions: string[]; // key decisions, each a short line
  numbers: string[]; // "numbers that matter": quantities, dollars, dates, timelines
  watchouts: string[]; // risks, blockers, timing pressure
  fullNotes: FullNotesSection[]; // detailed notes grouped into subsections
}

export interface TriageInput {
  title: string | null;
  folderNames: string[]; // Granola folder names the note belongs to
  attendees: string[]; // "Name <email> [merit|customer:Account|unknown]"
  summaryMarkdown: string | null;
  knownAccounts: string[]; // account display names that already exist in the vault
  date: string; // YYYY-MM-DD of the meeting
}

// Classify a Granola meeting into the vault's workstream/account model AND shape
// its body into the meeting-note contract (TL;DR, Notes, Decisions, dual-capture
// action items) in one call. Jordan reviews everything in /meetings afterward.
export async function triageMeeting(
  input: TriageInput,
): Promise<TriagedMeeting> {
  const system = [
    "You triage and structure meeting notes for Jordan Francis, who works mainly on Merit Medical OEM accounts.",
    "Given a Granola meeting (title, attendees, summary), do two jobs:",
    "1) FILE it: pick the workstream and, when it is a customer meeting, the account.",
    "   - workstream is one of: merit, sloan, personal, shared. Default to merit unless the signal clearly points elsewhere.",
    "   - account is the customer/company display name (e.g. 'MicroVention Terumo'). Prefer an exact match from the known-accounts list when the meeting is with that customer. Use null for internal/1:1/non-customer meetings.",
    "   - bucket is a short label for the meetings index: the customer short name (e.g. 'Terumo', 'Stryker') for customer meetings, or 'Internal' for internal ones.",
    "   - series: the recurring-series name if the title/summary clearly indicates a recurring meeting, else null.",
    "2) STRUCTURE it into the canonical note format:",
    "   - topic: a short one-line topic for the meeting (e.g. 'Regulatory, Quality Plan addendum'), or null.",
    "   - tldr: 2-4 sentences on what was decided, what moved, what is next.",
    "   - actionItems: mark isJordans true ONLY for items Jordan himself owns. Set owner to the person's name ('Jordan' for his own). For Jordan's items, set priority (high|med|low) and a due date (YYYY-MM-DD) only if the meeting stated one. For others, include a due string only if stated.",
    "   - decisions: key decisions, each a short line. Empty array if none.",
    "   - numbers: 'numbers that matter', quantities, dollars, percentages, dates, timelines. Empty array if none.",
    "   - watchouts: risks, blockers, timing pressure. Empty array if none.",
    "   - fullNotes: the detailed notes grouped into 1-5 subsections, each {subsection, text}. text may use simple bullet lines. This is where the substance goes.",
    "House style, follow exactly: never use em dashes (use commas, colons, or periods). Do not invent facts, names, dates, prices, or commitments. If something is unknown, leave it out rather than guessing.",
    "Output ONLY a single JSON object, no markdown fence, no commentary. Schema:",
    '{"workstream":"merit","account":null,"bucket":"Internal","series":null,"title":"...","topic":null,"tldr":"...","actionItems":[{"owner":"Jordan","text":"...","isJordans":true,"priority":"high","due":"2026-06-20"}],"decisions":["..."],"numbers":["..."],"watchouts":["..."],"fullNotes":[{"subsection":"...","text":"..."}]}',
  ].join("\n");

  const parts = [
    `Meeting date: ${input.date}`,
    `Title: ${input.title ?? "(untitled)"}`,
    input.folderNames.length
      ? `Granola folders: ${input.folderNames.join(", ")}`
      : "Granola folders: (none)",
    "",
    "Attendees:",
    ...(input.attendees.length ? input.attendees.map((a) => `- ${a}`) : ["- (none captured)"]),
    "",
    `Known accounts in the vault: ${input.knownAccounts.join(", ") || "(none provided)"}`,
    "",
    "Granola summary (markdown):",
    (input.summaryMarkdown ?? "(no summary)").slice(0, 8000),
    "",
    "Return the JSON object now.",
  ];

  const res = await client().messages.create({
    model: model(),
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: parts.join("\n") }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return normalizeTriage(parseJsonObject(text), input);
}

// Pull the first balanced JSON object out of a model response (tolerates a
// stray fence or prose around it).
function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Triage did not return JSON.");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function normalizeTriage(
  raw: Record<string, unknown>,
  input: TriageInput,
): TriagedMeeting {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const strOrNull = (v: unknown): string | null => {
    const s = str(v).trim();
    return s ? s : null;
  };
  const ws = isWorkstream(raw.workstream) ? raw.workstream : "merit";

  const lineList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((d) => noEmDash(str(d).trim())).filter(Boolean)
      : [];

  const fullNotes: FullNotesSection[] = Array.isArray(raw.fullNotes)
    ? raw.fullNotes
        .map((s): FullNotesSection | null => {
          const o = (s ?? {}) as Record<string, unknown>;
          const text = noEmDash(str(o.text).trim());
          const subsection = noEmDash(str(o.subsection).trim());
          if (!text && !subsection) return null;
          return { subsection: subsection || "Notes", text };
        })
        .filter((x): x is FullNotesSection => x !== null)
    : [];

  const prio = (v: unknown): Priority | undefined =>
    v === "high" || v === "med" || v === "low" ? v : undefined;

  const actionItems: TriagedActionItem[] = Array.isArray(raw.actionItems)
    ? raw.actionItems
        .map((item): TriagedActionItem | null => {
          const o = (item ?? {}) as Record<string, unknown>;
          const textVal = noEmDash(str(o.text).trim());
          if (!textVal) return null;
          const due =
            typeof o.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.due)
              ? o.due
              : undefined;
          return {
            owner: strOrNull(o.owner),
            text: textVal,
            isJordans: o.isJordans === true,
            priority: prio(o.priority),
            due,
          };
        })
        .filter((x): x is TriagedActionItem => x !== null)
    : [];

  return {
    workstream: ws,
    account: strOrNull(raw.account),
    bucket: strOrNull(raw.bucket) ?? (ws === "merit" ? "Merit" : "Internal"),
    series: strOrNull(raw.series),
    title: noEmDash(strOrNull(raw.title) ?? input.title ?? "Untitled meeting"),
    topic: strOrNull(raw.topic) ? noEmDash(strOrNull(raw.topic)!) : null,
    tldr: noEmDash(str(raw.tldr).trim()),
    actionItems,
    decisions: lineList(raw.decisions),
    numbers: lineList(raw.numbers),
    watchouts: lineList(raw.watchouts),
    fullNotes,
  };
}

// Generate a brief (morning brief, EOD recap, weekly review) from a context
// blob the caller assembles. Returns markdown body (no frontmatter).
export async function generateBrief(args: {
  kind: "morning" | "eod" | "weekly";
  context: string;
}): Promise<string> {
  const labels = {
    morning: "morning brief",
    eod: "end-of-day recap",
    weekly: "weekly review",
  } as const;

  const system = [
    `You write Jordan's ${labels[args.kind]}.`,
    "House style: never use em dashes (use commas, colons, periods). Concise, scannable, action-oriented.",
    "Do not invent tasks or facts. Work only from the context provided.",
    "Output clean markdown with short sections. No preamble, no signature.",
  ].join("\n");

  const res = await client().messages.create({
    model: model(),
    max_tokens: 2000,
    system,
    messages: [
      {
        role: "user",
        content: `Here is today's context from the vault:\n\n${args.context}\n\nWrite the ${labels[args.kind]} now.`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return noEmDash(text);
}
