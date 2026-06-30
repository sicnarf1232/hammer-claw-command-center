import { storeFirehoseEmail, type FirehosePayload, type StoreResult } from "./store";

// The legacy "flag in Outlook" flow (Flow A) posts a different payload shape to
// /api/webhooks/email. In the unified inbox there is no separate queue: a flagged
// email is just a firehose message with flagged=true. This adapts the flag
// payload to the firehose shape and stores/marks it.
interface FlaggedPayload {
  messageId?: string;
  receivedAt?: string;
  from?: { name?: string; email?: string };
  to?: unknown;
  cc?: unknown;
  subject?: string;
  bodyPreview?: string;
  bodyHtml?: string;
  bodyText?: string;
  hasAttachments?: boolean;
  webLink?: string;
  conversationId?: string;
}

export async function ingestFlagged(body: FlaggedPayload): Promise<StoreResult> {
  const payload: FirehosePayload = {
    direction: "inbound",
    internetMessageId: body.messageId,
    conversationId: body.conversationId,
    subject: body.subject,
    fromName: body.from?.name,
    fromEmail: body.from?.email,
    to: body.to,
    cc: body.cc,
    sentAt: body.receivedAt,
    bodyText: body.bodyText,
    bodyHtml: body.bodyHtml,
    hasAttachments: body.hasAttachments,
    webLink: body.webLink,
  };
  return storeFirehoseEmail(payload, { flagged: true });
}
