import type { Workstream } from "@/lib/vault/types";

// Flow B client (docs/03): the app POSTs a reply intent to a Power Automate
// HTTP-trigger URL, which creates an Outlook draft as Jordan. The URL contains
// a SAS token and is treated as a secret.

export function replyFlowConfigured(): boolean {
  return Boolean(process.env.POWER_AUTOMATE_REPLY_URL);
}

export interface ReplyIntent {
  action: "create_draft" | "send";
  inReplyTo: string; // original messageId
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
  fromIdentity: Workstream;
}

export class ReplyFlowNotConfiguredError extends Error {
  constructor() {
    super(
      "POWER_AUTOMATE_REPLY_URL is not set. Build Flow B and add its trigger URL.",
    );
    this.name = "ReplyFlowNotConfiguredError";
  }
}

export async function postReplyIntent(
  intent: ReplyIntent,
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = process.env.POWER_AUTOMATE_REPLY_URL;
  if (!url) throw new ReplyFlowNotConfiguredError();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intent),
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: body.slice(0, 500) };
}
