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
