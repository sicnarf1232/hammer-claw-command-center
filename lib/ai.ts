import Anthropic from "@anthropic-ai/sdk";
import { identityFor } from "@/lib/workstreams";
import type { Workstream } from "@/lib/vault/types";

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
