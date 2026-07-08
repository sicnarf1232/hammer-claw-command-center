import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emails, emailParticipants, emailAttachments } from "@/lib/db/schema";
import { blobConfigured } from "@/lib/documents";
import { extractAttachmentText } from "@/lib/extract";
import { ensureFirehoseSchema } from "./schema";
import { parseAddressList, mapParticipants, isSelfAddress, type Addr } from "./map";
import { loadDomainMap, domainOf } from "./domains";
import { isInlineAttachment } from "./attach";
import { promoteAttachmentToLibrary } from "./promote";
import { htmlTablesToText } from "@/lib/htmlTable";

// Skip storing/parsing attachments larger than this (base64 inflates ~33%).
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

export interface FirehoseAttachment {
  name?: string;
  contentType?: string;
  contentBytesBase64?: string;
  sizeBytes?: number;
}

export interface FirehosePayload {
  direction?: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  fromName?: string;
  fromEmail?: string;
  to?: unknown;
  cc?: unknown;
  sentAt?: string;
  bodyText?: string;
  bodyHtml?: string;
  hasAttachments?: boolean;
  webLink?: string;
  attachments?: FirehoseAttachment[];
}

export interface StoreResult {
  ok: true;
  deduped: boolean;
  emailId?: number;
  accountId?: number | null;
  needsReview?: boolean;
  attachments?: number;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function preview(text: string | null, html: string | null): string | null {
  const base = text ?? (html ? html.replace(/<[^>]+>/g, " ") : null);
  if (!base) return null;
  return base.replace(/\s+/g, " ").trim().slice(0, 240) || null;
}

function isImageType(ct: string | null, name: string | null): boolean {
  if (ct && ct.toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|heic)$/i.test(name ?? "");
}

// Normalize PA's attachment byte field across the naming variants Power Automate
// / Graph can emit (ContentBytes, contentBytes, contentBytesBase64, $content).
function attBytesB64(a: FirehoseAttachment): string | null {
  const o = a as Record<string, unknown>;
  const raw =
    o.contentBytesBase64 ??
    o.ContentBytes ??
    o.contentBytes ??
    o.content_bytes ??
    o.$content ??
    o.contentbytes;
  return typeof raw === "string" && raw.trim() ? raw : null;
}
function attName(a: FirehoseAttachment): string | null {
  return str(a.name ?? (a as Record<string, unknown>).Name);
}
function attType(a: FirehoseAttachment): string | null {
  return str(a.contentType ?? (a as Record<string, unknown>).ContentType);
}

export interface StoreOpts {
  flagged?: boolean; // the Outlook "act on this" flag
}

export async function storeFirehoseEmail(
  payload: FirehosePayload,
  opts: StoreOpts = {},
): Promise<StoreResult> {
  await ensureFirehoseSchema();
  const db = getDb();

  const messageId = str(payload.internetMessageId);

  // Dedupe on internetMessageId (a message is captured by both the received and
  // sent flows, or retried by Power Automate). If a later capture carries the
  // flag, set it on the existing row rather than inserting a duplicate.
  if (messageId) {
    const existing = await db
      .select({ id: emails.id })
      .from(emails)
      .where(eq(emails.messageId, messageId))
      .limit(1);
    if (existing.length > 0) {
      if (opts.flagged) {
        await db
          .update(emails)
          .set({ flagged: true, flaggedAt: new Date() })
          .where(eq(emails.id, existing[0].id));
      }
      return { ok: true, deduped: true, emailId: existing[0].id };
    }
  }

  // fromEmail is usually a bare address, but Outlook can send "Name <addr>";
  // parse defensively and prefer the explicit fromName for the display name.
  const fromParsed = parseAddressList(payload.fromEmail)[0];
  const from: Addr | null = fromParsed
    ? { name: str(payload.fromName) ?? fromParsed.name, email: fromParsed.email }
    : null;

  // Direction: trust an explicit "outbound" from the flow, but ALSO infer it when
  // the sender is Jordan himself. The Sent-capture flow does not always tag
  // direction, which made his own replies show as received; this is the safety
  // net so a message from Jordan is always outbound.
  const direction =
    payload.direction === "outbound" || (from?.email && isSelfAddress(from.email))
      ? "outbound"
      : "inbound";
  const to = parseAddressList(payload.to);
  const cc = parseAddressList(payload.cc);

  const mapping = await mapParticipants(db, from, to, cc);

  // Domain fallback: if no participant resolved to an account, but the external
  // sender's domain is linked to one (Jordan linked the domain earlier), map it.
  let emailAccountId = mapping.emailAccountId;
  let needsReview = mapping.needsReview;
  if (emailAccountId == null) {
    const domainMap = await loadDomainMap();
    for (const p of mapping.participants) {
      const acc = domainMap.get(domainOf(p.email));
      if (acc != null) {
        emailAccountId = acc;
        needsReview = false;
        break;
      }
    }
  }

  const rawBodyText = str(payload.bodyText);
  const bodyHtml = str(payload.bodyHtml);
  // Capture pasted spreadsheet tables (HTML <table>) that the plain-text body
  // drops, so the numbers reach the brain and the AI drafts.
  const tableText = bodyHtml ? htmlTablesToText(bodyHtml) : "";
  const bodyText = tableText
    ? [rawBodyText, "Pasted table data:", tableText].filter(Boolean).join("\n\n")
    : rawBodyText;
  const sentAt = payload.sentAt ? new Date(payload.sentAt) : null;
  const validSentAt = sentAt && !isNaN(sentAt.getTime()) ? sentAt : null;
  const recipients = mapping.participants.map((p) => ({
    name: p.name,
    email: p.email,
    role: p.role,
  }));

  const [row] = await db
    .insert(emails)
    .values({
      messageId,
      threadId: str(payload.conversationId),
      direction,
      receivedAt: validSentAt,
      sentAt: validSentAt,
      fromName: str(payload.fromName),
      fromEmail: from?.email ?? null,
      toAddrs: to.map((a) => a.email),
      cc: cc.map((a) => a.email),
      recipients,
      subject: str(payload.subject),
      bodyPreview: preview(bodyText, bodyHtml),
      bodyText,
      bodyHtml,
      hasAttachments: Boolean(payload.hasAttachments) || (payload.attachments?.length ?? 0) > 0,
      webLink: str(payload.webLink),
      accountId: emailAccountId,
      personId: mapping.emailPersonId,
      needsReview,
      flagged: Boolean(opts.flagged),
      flaggedAt: opts.flagged ? new Date() : null,
    })
    .returning({ id: emails.id });

  const emailId = row.id;

  // Participant links.
  if (mapping.participants.length > 0) {
    await db.insert(emailParticipants).values(
      mapping.participants.map((p) => ({
        emailId,
        personId: p.personId,
        accountId: p.accountId,
        address: p.email,
        name: p.name ?? null,
        role: p.role,
      })),
    );
  }

  // Attachments: store bytes to a private Blob (when configured), extract PDF
  // text for the brain. Best-effort per attachment; a failure never drops the
  // email.
  let attCount = 0;
  for (const a of payload.attachments ?? []) {
    try {
      const name = attName(a);
      const contentType = attType(a);
      const b64 = attBytesB64(a);
      const bytes = b64 ? Buffer.from(b64, "base64") : null;
      const rawSize =
        typeof a.sizeBytes === "number"
          ? a.sizeBytes
          : typeof (a as Record<string, unknown>).size === "number"
            ? ((a as Record<string, unknown>).size as number)
            : null;
      const size = bytes?.byteLength ?? rawSize;

      // Inline images (signature logos, embedded pictures) are stored but
      // FLAGGED: they stay out of the attachment chips, and their bytes are
      // what resolves cid: references so embedded images render in the
      // thread view. Oversized inline images are skipped outright.
      const inlineFlag =
        (a as Record<string, unknown>).isInline ?? (a as Record<string, unknown>).IsInline;
      const isInline = isInlineAttachment(
        name,
        contentType,
        size,
        inlineFlag as boolean | undefined,
      );
      if (isInline && (!bytes || bytes.byteLength > MAX_ATTACHMENT_BYTES)) {
        continue;
      }
      if (bytes && bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        // Too large to retain inline; record metadata only.
        await db.insert(emailAttachments).values({
          emailId,
          fileName: name,
          contentType,
          isImage: isImageType(contentType, name),
          blobUrl: null,
          sizeBytes: size,
          extractedText: null,
        });
        attCount++;
        continue;
      }

      let blobUrl: string | null = null;
      if (bytes && blobConfigured()) {
        const safe = (name ?? "attachment").replace(/[^A-Za-z0-9._-]/g, "_");
        const key = `email-attachments/${emailId}/${safe}`;
        const blob = await put(key, bytes, {
          access: "private",
          contentType: contentType ?? "application/octet-stream",
          addRandomSuffix: true,
        });
        blobUrl = blob.url;
      }

      // Extract text from any supported document (PDF, Word, Excel, CSV, text)
      // so it feeds the brain, not just PDFs.
      const isImage = isImageType(contentType, name);
      let extractedText: string | null = null;
      if (bytes && !isImage) {
        extractedText =
          (await extractAttachmentText(new Uint8Array(bytes), contentType, name).catch(
            () => "",
          )) || null;
      }

      await db.insert(emailAttachments).values({
        emailId,
        fileName: name,
        contentType,
        isImage,
        isInline,
        blobUrl,
        sizeBytes: size,
        extractedText,
      });
      if (!isInline) attCount++;

      // Promote meaningful docs into the shared Document Library (reusable brain
      // knowledge). Best-effort; skips images, tiny files, and duplicates.
      if (blobUrl && !isInline) {
        await promoteAttachmentToLibrary({
          fileName: name,
          contentType,
          sizeBytes: size,
          blobUrl,
          extractedText,
          accountId: emailAccountId,
          isImage,
        }).catch(() => null);
      }
    } catch (err) {
      console.error("[firehose] attachment store failed:", err);
    }
  }

  // Reflect REAL attachment presence (inline images were skipped above), so a
  // message with only a signature logo no longer shows an attachment.
  await db
    .update(emails)
    .set({ hasAttachments: attCount > 0 })
    .where(eq(emails.id, emailId));

  return {
    ok: true,
    deduped: false,
    emailId,
    accountId: emailAccountId,
    needsReview,
    attachments: attCount,
  };
}

// Lightweight audit row (no attachment bytes) so the firehose is debuggable
// without bloating webhook_events with base64 blobs.
export function slimAudit(payload: FirehosePayload): Record<string, unknown> {
  return {
    direction: payload.direction,
    internetMessageId: payload.internetMessageId,
    conversationId: payload.conversationId,
    subject: payload.subject,
    fromEmail: payload.fromEmail,
    sentAt: payload.sentAt,
    hasAttachments: payload.hasAttachments,
    attachmentCount: payload.attachments?.length ?? 0,
    kind: "firehose",
  };
}
