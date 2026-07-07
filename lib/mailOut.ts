import { getDocument, openDocumentBlob } from "@/lib/documents";
import { getAttachment, openAttachmentBlob } from "@/lib/firehose/read";
import type { OutAttachment } from "@/lib/powerAutomate";

// Resolve outbound attachments to {name, contentType, base64} for Flow B. Sources:
//  - "document": a library document (documents.blobUrl)
//  - "emailAttachment": a stored inbound attachment (email_attachments.blobUrl)
//  - "upload": a file the user just picked in the composer (already base64 in the
//    request; no blob read needed)
// Bounded in total size so we never post an enormous JSON body to Power Automate.

const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

// Keep outbound HTML to a safe, mail-friendly subset. Drop script/style and
// event handlers; the mail is sent from Jordan's own account, but we still send
// clean markup. Shared by /api/reply, /api/mail, and /api/tasks/send-update.
export function sanitizeMailHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

// Convert a plain-text body into simple HTML with a signature block for the
// given sending identity.
export function textToMailHtml(text: string, name: string, email: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const bodyHtml = escaped.replace(/\n/g, "<br>");
  const sig = `Jordan Francis<br>${name}<br>${email}`;
  return `<div>${bodyHtml}</div><br><div>${sig}</div>`;
}

export type AttachmentRef =
  | { kind: "document"; id: number }
  | { kind: "emailAttachment"; id: number }
  | { kind: "upload"; name: string; contentType?: string; base64: string };

async function blobToBase64(
  open: () => Promise<{ stream: unknown; statusCode: number } | null>,
): Promise<string | null> {
  const res = await open();
  if (!res || res.statusCode !== 200) return null;
  const buf = Buffer.from(
    await new Response(res.stream as unknown as ReadableStream).arrayBuffer(),
  );
  return buf.toString("base64");
}

export async function gatherAttachments(refs: AttachmentRef[]): Promise<OutAttachment[]> {
  const out: OutAttachment[] = [];
  let total = 0;

  for (const ref of refs) {
    try {
      let name = "attachment";
      let contentType = "application/octet-stream";
      let base64: string | null = null;

      if (ref.kind === "upload") {
        name = ref.name || "attachment";
        contentType = ref.contentType || "application/octet-stream";
        base64 = ref.base64 || null;
      } else if (ref.kind === "document") {
        const doc = await getDocument(ref.id);
        if (!doc?.blobUrl) continue;
        name = doc.fileName || doc.title || "document";
        contentType = doc.contentType || "application/octet-stream";
        base64 = await blobToBase64(() => openDocumentBlob(doc.blobUrl) as never);
      } else if (ref.kind === "emailAttachment") {
        const att = await getAttachment(ref.id);
        if (!att?.blobUrl) continue;
        name = att.fileName || "attachment";
        contentType = att.contentType || "application/octet-stream";
        base64 = await blobToBase64(() => openAttachmentBlob(att.blobUrl!) as never);
      }

      if (!base64) continue;
      // base64 length ~= 4/3 of bytes; approximate the byte size for the cap.
      total += Math.floor((base64.length * 3) / 4);
      if (total > MAX_TOTAL_BYTES) break;
      out.push({ name, contentType, contentBytesBase64: base64 });
    } catch {
      // Skip an attachment that fails to read; never block the send.
    }
  }
  return out;
}
