import type { Workstream } from "@/lib/vault/types";

// Flow B client (docs/03): the app POSTs a reply intent to a Power Automate
// HTTP-trigger URL, which creates an Outlook draft as Jordan. The URL contains
// a SAS token and is treated as a secret.

export function replyFlowConfigured(): boolean {
  return Boolean(process.env.POWER_AUTOMATE_REPLY_URL);
}

export interface OutAttachment {
  name: string;
  contentType: string;
  contentBytesBase64: string;
}

// The contract Flow B implements (see the Power Automate prompt): one HTTP call
// creates an Outlook DRAFT for a new email, a reply, or a forward, with optional
// attachments. inReplyTo is the original internet message id (required for
// reply/forward). action defaults to reply for backward compatibility.
export interface MailIntent {
  action: "new" | "reply" | "forward";
  inReplyTo?: string; // original internetMessageId, for reply/forward
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  fromIdentity: Workstream;
  attachments?: OutAttachment[];
}

// Kept for the existing reply path.
export interface ReplyIntent {
  action: "create_draft" | "send";
  inReplyTo: string; // original messageId
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
  fromIdentity: Workstream;
  attachments?: OutAttachment[];
}

export class ReplyFlowNotConfiguredError extends Error {
  constructor() {
    super(
      "POWER_AUTOMATE_REPLY_URL is not set. Build Flow B and add its trigger URL.",
    );
    this.name = "ReplyFlowNotConfiguredError";
  }
}

async function postToFlowB(
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = process.env.POWER_AUTOMATE_REPLY_URL;
  if (!url) throw new ReplyFlowNotConfiguredError();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: body.slice(0, 500) };
}

export async function postReplyIntent(
  intent: ReplyIntent,
): Promise<{ ok: boolean; status: number; body: string }> {
  return postToFlowB(intent);
}

// New/reply/forward with attachments (compose + forward features).
export async function postMailIntent(
  intent: MailIntent,
): Promise<{ ok: boolean; status: number; body: string }> {
  return postToFlowB(intent);
}
