import { identityFor } from "@/lib/workstreams";
import { todayISO } from "@/lib/dates";
import type { Workstream } from "@/lib/vault/types";

export interface FileableEmail {
  messageId: string;
  fromName?: string | null;
  fromEmail?: string | null;
  toAddrs?: string[] | null;
  subject?: string | null;
  receivedAt?: Date | string | null;
  bodyText?: string | null;
  bodyPreview?: string | null;
  webLink?: string | null;
}

export interface BuiltNote {
  path: string; // vault-relative
  content: string;
  message: string; // commit message
}

export class FilingNotAllowedError extends Error {}

// Build the markdown note for filing a flagged email into a workstream Inbox/.
// Throws if the workstream has no inbox destination (sloan/shared): the app
// stops and asks rather than guessing an identity (CLAUDE.md rule 5).
export function buildInboxNote(
  email: FileableEmail,
  workstream: Workstream,
  account?: string,
): BuiltNote {
  const identity = identityFor(workstream);
  if (!identity.inboxFolder) {
    throw new FilingNotAllowedError(
      `No inbox folder is defined for the "${workstream}" workstream. Pick a different workstream or tell me where ${identity.label} emails should be filed.`,
    );
  }

  const created = todayISO();
  const subject = clean(email.subject) || "(no subject)";
  const fromName = clean(email.fromName);
  const fromEmail = clean(email.fromEmail);
  const fromLabel = fromName
    ? fromEmail
      ? `${fromName} <${fromEmail}>`
      : fromName
    : fromEmail || "Unknown sender";

  const received = normDate(email.receivedAt);
  const slug = slugify(`${fromName || fromEmail || "email"} ${subject}`);
  const path = `${identity.inboxFolder}/${created}-${slug}.md`;

  const fm: string[] = [
    "---",
    `workstream: ${workstream}`,
    "type: inbox",
    "status: active",
    `created: ${created}`,
    "source: email",
    `from: ${yamlString(fromLabel)}`,
  ];
  if (received) fm.push(`received: ${received}`);
  fm.push(`message_id: ${yamlString(email.messageId)}`);
  if (account) fm.push(`account: ${yamlString(`[[${account}]]`)}`);
  if (email.webLink) fm.push(`web_link: ${yamlString(email.webLink)}`);
  fm.push("---");

  const bodyText = clean(email.bodyText) || clean(email.bodyPreview) || "";
  const to = (email.toAddrs ?? []).join(", ");

  const content =
    fm.join("\n") +
    "\n\n" +
    `# ${subject}\n\n` +
    `From: ${fromLabel}\n` +
    (to ? `To: ${to}\n` : "") +
    (received ? `Received: ${received}\n` : "") +
    (email.webLink ? `Open in Outlook: ${email.webLink}\n` : "") +
    "\n" +
    bodyText +
    "\n";

  const message = `app: file ${fromName || fromEmail || "email"} email ${created}`;

  return { path, content, message };
}

function clean(v: string | null | undefined): string {
  // Strip em dashes from any generated content (house style, CLAUDE.md rule 7).
  return (v ?? "").replace(/—/g, ", ").trim();
}

function normDate(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return typeof v === "string" ? v : null;
  return d.toISOString();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function yamlString(s: string): string {
  // Always quote to be safe with colons/brackets in subjects and addresses.
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
