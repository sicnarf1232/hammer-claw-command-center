import Anthropic from "@anthropic-ai/sdk";
import { identityFor } from "@/lib/workstreams";
import {
  isWorkstream,
  type Priority,
  type Workstream,
} from "@/lib/vault/types";
import type { RawQuoteInput } from "@/lib/quote/types";

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

// Workhorse model for high-volume work (email + meeting triage, suggestions,
// series updates, parsing). Sonnet 5, not Haiku: markedly better at reading a
// note accurately and judging relevance, without Opus cost/latency on every
// call. Override with ANTHROPIC_FAST_MODEL; heavy synthesis still uses Opus via
// model().
function fastModel(): string {
  return process.env.ANTHROPIC_FAST_MODEL ?? "claude-sonnet-5";
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

export type OwnerClass = "me" | "team" | "customer" | "unknown";

export interface TriagedActionItem {
  owner: string | null; // "Jordan" for Jordan's items, the person's name otherwise
  text: string; // action text, owner prefix stripped
  isJordans: boolean; // true => render with a field row, surfaces as a real task
  priority?: Priority;
  due?: string; // YYYY-MM-DD if the meeting stated a concrete date
  dueText?: string; // the raw due phrase when not a concrete date (flag to fix)
  ownerClass?: OwnerClass; // assigned during the pull from the roster
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
    "   - actionItems: ALWAYS set owner to the person's name ('Jordan' for his own). Mark isJordans true ONLY for items Jordan himself owns; set priority (high|med|low) for those. For the due date: if the meeting stated a concrete date set due to YYYY-MM-DD; if it stated a vague or range due ('this week', 'before Friday', 'Jun 15-16') set dueText to that exact phrase and leave due empty.",
    "   - decisions: key decisions, each a short line. Empty array if none.",
    "   - numbers: 'numbers that matter', quantities, dollars, percentages, dates, timelines. Empty array if none.",
    "   - watchouts: risks, blockers, timing pressure. Empty array if none.",
    "   - fullNotes: the detailed notes grouped into 1-5 subsections, each {subsection, text}. text may use simple bullet lines. This is where the substance goes.",
    "House style, follow exactly: never use em dashes (use commas, colons, or periods). Do not invent facts, names, dates, prices, or commitments. If something is unknown, leave it out rather than guessing.",
    "Output ONLY a single JSON object, no markdown fence, no commentary. Schema:",
    '{"workstream":"merit","account":null,"bucket":"Internal","series":null,"title":"...","topic":null,"tldr":"...","actionItems":[{"owner":"Jordan","text":"...","isJordans":true,"priority":"high","due":"2026-06-20","dueText":""}],"decisions":["..."],"numbers":["..."],"watchouts":["..."],"fullNotes":[{"subsection":"...","text":"..."}]}',
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
    model: fastModel(),
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
          const dueText = !due ? (strOrNull(o.dueText) ?? undefined) : undefined;
          return {
            owner: strOrNull(o.owner),
            text: textVal,
            isJordans: o.isJordans === true,
            priority: prio(o.priority),
            due,
            dueText: dueText ? noEmDash(dueText) : undefined,
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

// ---- Rolling-series update (Granola pull) ----

export interface SeriesUpdateInput {
  seriesName: string;
  cadence?: string;
  currentState: string; // the existing Current State markdown (may be empty)
  meetingTitle: string;
  meetingDate: string; // YYYY-MM-DD
  meetingSummary: string; // tldr + key points for this meeting
}

export interface SeriesUpdate {
  logBullets: string[]; // 3-5 concise bullets for this meeting's log entry
  currentState: string; // rewritten Current State markdown
}

// Maintain a rolling-series note when a matching meeting is filed: produce a
// short log entry and rewrite Current State (carry forward open threads, retire
// resolved ones, update numbers/dates/status). Does not restate action items.
export async function updateSeries(
  input: SeriesUpdateInput,
): Promise<SeriesUpdate> {
  const system = [
    `You maintain the rolling-series note "${input.seriesName}"${input.cadence ? ` (${input.cadence})` : ""} for Jordan Francis.`,
    "A new meeting in this series was just filed. Do two things:",
    "1) logBullets: 3-5 concise bullets summarizing THIS meeting for the reverse-chronological log. Capture what moved, asks, and status. Do not restate the full action-item list.",
    "2) currentState: rewrite the pinned Current State markdown. Carry forward still-open threads, retire resolved ones, update numbers, dates, and status. Keep it tight and current; it is the single source of truth for where this stands. Use short markdown (bold lead-ins, bullets) like the existing one.",
    "House style: never use em dashes (use commas, colons, or periods). Do not invent facts. Work only from the existing Current State and the new meeting.",
    'Output ONLY a single JSON object: {"logBullets":["..."],"currentState":"..."}',
  ].join("\n");

  const parts = [
    `Existing Current State:\n${input.currentState.trim() || "(none yet, this may be the first entry)"}`,
    "",
    `New meeting: ${input.meetingTitle} (${input.meetingDate})`,
    "",
    `Meeting summary:\n${input.meetingSummary.slice(0, 6000)}`,
    "",
    "Return the JSON object now.",
  ];

  const res = await client().messages.create({
    model: fastModel(),
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: parts.join("\n") }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const raw = parseJsonObject(text);
  const bullets = Array.isArray(raw.logBullets)
    ? raw.logBullets
        .map((b) => noEmDash(String(b).trim()))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const currentState = noEmDash(
    typeof raw.currentState === "string" ? raw.currentState.trim() : "",
  );
  return { logBullets: bullets, currentState };
}

// ---- Brain: answer a question grounded in the vault (Milestone 2 #5) ----

export interface BrainTurn {
  role: "user" | "assistant";
  content: string;
}

// Answer Jordan's question as the Merit OEM team's assistant, grounded ONLY in
// the supplied vault context. Prior turns give light conversational memory.
export async function answerVaultQuestion(args: {
  question: string;
  context: string;
  history?: BrainTurn[];
}): Promise<string> {
  const system = [
    "You are the Film Room brain: the reference assistant for Jordan Francis and his Merit Medical OEM team.",
    "Answer using ONLY the vault context provided in the first message. The context is the source of truth (accounts, contacts, open tasks, meetings).",
    "If the answer is not in the context, say so plainly and suggest where it might live (a specific account, meeting, or task view). Do not invent facts, names, dates, prices, part numbers, or commitments.",
    "Be concise and direct. Use short markdown: lead with the answer, then supporting bullets. Cite the account or meeting you drew from when relevant.",
    "House style: never use em dashes. Use commas, colons, or periods.",
  ].join("\n");

  const messages: Anthropic.MessageParam[] = [];
  messages.push({
    role: "user",
    content: `Vault context (source of truth):\n\n${args.context}\n\nAcknowledge and wait for the question.`,
  });
  messages.push({
    role: "assistant",
    content: "Ready. Ask your question and I will answer from the vault.",
  });
  for (const t of args.history ?? []) {
    messages.push({ role: t.role, content: t.content });
  }
  messages.push({ role: "user", content: args.question });

  const res = await client().messages.create({
    model: model(),
    max_tokens: 1500,
    system,
    messages,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return noEmDash(text);
}

// ---- Quote: free-form English parser (Quote redesign) --------------------

// Parse a free-form quote request into the loose RawQuoteInput shape. Uses the
// fast model. Parser-added items are custom (no sterility inference downstream).
export async function parseQuoteFreeform(
  userText: string,
): Promise<RawQuoteInput> {
  const system = [
    "You parse free-form quote requests for Merit Medical OEM into JSON.",
    "Return ONLY valid JSON, no markdown, no commentary. Schema:",
    "{",
    '  "customer_name": string|null,',
    '  "customer_short": string|null,',
    '  "customer_contact": string|null,',
    '  "description": string|null,',
    '  "quote_short": string|null,',
    '  "quote_date": string|null,',
    '  "line_items": [',
    '    { "pn": string, "qty": number, "price": string, "lead": string,',
    '      "desc": string, "details": string[] }',
    "  ]",
    "}",
    "Rules:",
    "- qty is a number with no commas.",
    '- price includes "$" and is per-unit.',
    '- lead is a phrase like "4-6 weeks" or "8 weeks".',
    "- desc is the SHORT product name; one sentence max.",
    "- details is an array, each element ONE short attribute (size, material,",
    "  sterilization, packaging, feature). Each becomes its own line in the PDF.",
    "  Do NOT collapse the bullets into a single string.",
    "- quote_short should be a short filename tag (no spaces).",
    '- customer_short is a short version of the company name (e.g. "Stryker NV").',
    "- Skip any field you cannot determine; use null or omit.",
    "House style: never use em dashes.",
  ].join("\n");

  const res = await client().messages.create({
    model: fastModel(),
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: `Free-text request:\n${userText}` }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const raw = parseJsonObject(text);
  return mapFreeformQuote(raw);
}

function mapFreeformQuote(raw: Record<string, unknown>): RawQuoteInput {
  const str = (v: unknown): string | undefined => {
    const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
    return s ? noEmDash(s) : undefined;
  };
  const items = Array.isArray(raw.line_items) ? raw.line_items : [];
  return {
    customerName: str(raw.customer_name),
    customerShort: str(raw.customer_short),
    customerContact: str(raw.customer_contact),
    description: str(raw.description),
    quoteShort: str(raw.quote_short),
    quoteDate: str(raw.quote_date),
    lineItems: items.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const details = Array.isArray(o.details)
        ? o.details.map((d) => noEmDash(String(d).trim())).filter(Boolean)
        : [];
      return {
        custom: true,
        quantity: o.qty != null ? String(o.qty) : undefined,
        partNo: str(o.pn),
        description: str(o.desc),
        attributes: details,
        price: str(o.price),
        leadTime: str(o.lead),
      };
    }),
  };
}

// ---- Email triage (Milestone 4). Haiku classifies a thread into a pathway +
// priority + a one-line summary, so the inbox can surface what needs action.
export type EmailPathway =
  | "needs-reply"
  | "quote-request"
  | "quality-pcn"
  | "logistics"
  | "fyi"
  | "noise";

export interface EmailTriageResult {
  summary: string;
  pathway: EmailPathway;
  priority: "high" | "medium" | "low";
  needsReply: boolean;
}

export interface TriageThreadInput {
  subject: string;
  account?: string | null;
  messages: Array<{ direction: string; from: string; at?: string | null; text: string }>;
}

const PATHWAYS: EmailPathway[] = [
  "needs-reply",
  "quote-request",
  "quality-pcn",
  "logistics",
  "fyi",
  "noise",
];

export async function triageEmailThread(
  input: TriageThreadInput,
): Promise<EmailTriageResult> {
  const system = [
    "You triage email threads for the Merit Medical OEM sales team (Jordan Francis).",
    "Jordan is Jordan.Francis@merit.com; messages he SENT are direction=outbound.",
    "Return ONLY valid JSON, no markdown. Schema:",
    "{",
    '  "summary": string,   // ONE sentence, <= 22 words, what the thread is about + the ask',
    '  "pathway": "needs-reply"|"quote-request"|"quality-pcn"|"logistics"|"fyi"|"noise",',
    '  "priority": "high"|"medium"|"low",',
    '  "needs_reply": boolean  // does Jordan still owe a response?',
    "}",
    "Guidance:",
    "- needs-reply: a customer asked something still open and Jordan has not answered.",
    "- quote-request: they want pricing/a quote. quality-pcn: quality issue, complaint, or OEM PCN.",
    "- logistics: orders, shipping, scheduling, forecasts. fyi: informational, no action.",
    "- noise: newsletters, auto-replies, spam, calendar noise.",
    "- If Jordan's outbound message is the latest and nothing is pending, needs_reply=false.",
    "- priority high only for time-sensitive customer asks, quality issues, or escalations.",
    "House style: never use em dashes in the summary.",
  ].join("\n");

  const convo = input.messages
    .map(
      (m) =>
        `[${m.direction === "outbound" ? "JORDAN (sent)" : "THEM"}${m.at ? " " + m.at : ""}] ${m.from}: ${m.text.slice(0, 1200)}`,
    )
    .join("\n\n")
    .slice(0, 9000);

  const res = await client().messages.create({
    model: fastModel(),
    max_tokens: 400,
    system,
    messages: [
      {
        role: "user",
        content: `Account: ${input.account ?? "unknown"}\nSubject: ${input.subject}\n\nThread:\n${convo}`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const raw = parseJsonObject(text);
  const pathway = PATHWAYS.includes(raw.pathway as EmailPathway)
    ? (raw.pathway as EmailPathway)
    : "fyi";
  const priority =
    raw.priority === "high" || raw.priority === "low" ? raw.priority : "medium";
  return {
    summary: noEmDash(String(raw.summary ?? "").trim()).slice(0, 240) || "No summary.",
    pathway,
    priority,
    needsReply: Boolean(raw.needs_reply) || pathway === "needs-reply",
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
