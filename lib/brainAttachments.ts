// Brain chat attachments (dev-feedback #6): Jordan can drop files and photos
// into the Brain composer and the model reads them. This module holds the pure,
// shared pieces: what is accepted, the size/count caps (enforced client- AND
// server-side), ref validation for the refs the client echoes back, and the
// server-side history trimming that keeps old turns from re-shipping megabytes.

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB per file

export type AttachmentKind = "image" | "pdf" | "text";

// Metadata-only reference to an uploaded file. The bytes live in Vercel Blob
// (private); localStorage and the chat wire format carry only this.
export interface AttachmentRef {
  name: string;
  url: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
}

// Image types the Anthropic API accepts as image blocks.
export const IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

// Small text-ish files get inlined as untrusted text for the model.
const TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/x-log",
  "application/json",
]);
const TEXT_EXTS = /\.(txt|md|markdown|csv|log|json)$/i;

// The accept attribute for the file input (kept next to the rules it mirrors).
export const ATTACHMENT_ACCEPT =
  ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.log,.json,image/png,image/jpeg,image/gif,image/webp,application/pdf";

// Classify a file by mime, falling back to the extension (browsers often send
// an empty or generic mime for .md/.log files). Null means not accepted.
export function attachmentKind(mime: string, name: string): AttachmentKind | null {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  if ((IMAGE_MIMES as readonly string[]).includes(m)) return "image";
  if (m === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (TEXT_MIMES.has(m) || m.startsWith("text/") || TEXT_EXTS.test(name)) return "text";
  return null;
}

export interface AttachmentCheck {
  ok: boolean;
  kind?: AttachmentKind;
  error?: string;
}

// Validate one candidate file (client pre-flight and server gate share this).
export function validateAttachment(file: {
  name: string;
  type: string;
  size: number;
}): AttachmentCheck {
  const kind = attachmentKind(file.type, file.name);
  if (!kind) {
    return {
      ok: false,
      error: `"${file.name}" is not a supported type. Use images (png, jpeg, gif, webp), PDFs, or text files (txt, md, csv, log, json).`,
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `"${file.name}" is too large. Files are capped at 8 MB each.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: `"${file.name}" is empty.` };
  }
  return { ok: true, kind };
}

// Count gate: how many more files fit on this message. Returns an error string
// or null when the add is fine.
export function checkAttachmentCount(existing: number, adding: number): string | null {
  if (existing + adding > MAX_ATTACHMENTS_PER_MESSAGE) {
    return `Max ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`;
  }
  return null;
}

// Parse an attachment ref from untrusted client JSON. Only accepts refs that
// point at this app's Vercel Blob store (private blobs; anything else the
// server could not read anyway) and that fit the caps.
export function parseAttachmentRef(v: unknown): AttachmentRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 200) : "";
  const url = typeof o.url === "string" ? o.url : "";
  const mime = typeof o.mime === "string" ? o.mime : "";
  const size = typeof o.size === "number" && Number.isFinite(o.size) ? o.size : 0;
  if (!name || !url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !u.hostname.endsWith(".blob.vercel-storage.com")) {
      return null;
    }
  } catch {
    return null;
  }
  if (size <= 0 || size > MAX_ATTACHMENT_BYTES) return null;
  const kind = attachmentKind(mime, name);
  if (!kind) return null;
  return { name, url, mime, size, kind };
}

// Human size for chips: "412 KB", "2.1 MB".
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

// Textual stand-in for attachments on older turns: "[attached: quote.pdf]".
export function attachmentMarker(atts: Array<{ name: string }>): string {
  return `[attached: ${atts.map((a) => a.name).join(", ")}]`;
}

export interface BrainHistoryMsg {
  role: "user" | "assistant";
  content: string;
  attachments?: AttachmentRef[];
}

// Server-side trim: only the LATEST user turn keeps live attachment refs (those
// get re-fetched and sent to the model as real blocks); every older turn keeps
// just a textual marker so the conversation context stays lean. Also enforces
// the per-message cap.
export function trimAttachmentHistory(history: BrainHistoryMsg[]): BrainHistoryMsg[] {
  let lastUserIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  return history.map((m, i) => {
    const atts = m.attachments ?? [];
    if (!atts.length) return { role: m.role, content: m.content };
    if (i === lastUserIdx) {
      return {
        role: m.role,
        content: m.content,
        attachments: atts.slice(0, MAX_ATTACHMENTS_PER_MESSAGE),
      };
    }
    const marker = attachmentMarker(atts);
    return {
      role: m.role,
      content: m.content ? `${marker}\n${m.content}` : marker,
    };
  });
}
