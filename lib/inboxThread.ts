// Thread view data assembly: everything the /api/inbox/thread-data route
// (and the ThreadDetail panel it feeds) needs to render a conversation,
// gathered in one place and returned as a JSON-serializable payload.
import { getThread, accountNames, type ThreadMessage } from "@/lib/firehose/read";
import { markRead } from "@/lib/firehose/actions";
import { personCardsForEmails, type PersonCard } from "@/lib/peopleDb";
import { ensureTriageForKeys, getTriageMap, type TriageRow } from "@/lib/firehose/triage";
import { suggestTasksForThread, type TaskSuggestion } from "@/lib/firehose/suggest";
import { suggestDocsForThread } from "@/lib/firehose/docSuggest";
import { suggestAccountForEmail, listDbAccounts } from "@/lib/firehose/senderSuggest";
import { isInternal, isSelfAddress } from "@/lib/firehose/map";
import { appTimezone } from "@/lib/dates";
import { aiConfigured } from "@/lib/ai";
import { formatEmailBody } from "@/lib/emailFormat";
import {
  suggestTasksForEmail,
  linkedTasksForEmailIds,
  type LinkedTaskRef,
} from "@/lib/taskEmailLinks";
import type { TaskEmailMatch } from "@/lib/taskEmailMatch";

const JORDAN = "jordan.francis@merit.com";

export interface PersonRef {
  name: string; // display name (falls back to the address)
  email: string;
  title: string | null;
  accountName: string | null;
  internal: boolean;
}

export interface ThreadMsgAttachment {
  id: number;
  fileName: string | null;
  sizeBytes: number | null;
  isImage: boolean;
  isPdf: boolean;
  hasBlob: boolean;
}

export interface ThreadMsg {
  id: number;
  direction: "inbound" | "outbound";
  internal: boolean;
  from: PersonRef;
  recipients: PersonRef[];
  atLabel: string;
  bodyMain: string;
  bodyQuoted: string | null;
  bodyHtml: string | null;
  // Where the quoted history starts inside bodyHtml (Outlook/Gmail reply
  // separators), so the UI can show just THIS message's content by default.
  bodyHtmlCut: number | null;
  flagged: boolean;
  attachments: ThreadMsgAttachment[];
  replyTo: string[];
  replyCc: string[];
}

export interface ThreadParticipant {
  email: string;
  name: string;
}

export interface ThreadTriage {
  pathway: TriageRow["pathway"];
  reviewed: TriageRow["reviewed"];
  summary: TriageRow["summary"];
  model: TriageRow["model"];
  aiGenerated: TriageRow["aiGenerated"];
  manual: TriageRow["manual"];
  priority: TriageRow["priority"];
  needsReply: TriageRow["needsReply"];
}

export interface ThreadViewData {
  subject: string;
  count: number;
  messageIds: number[];
  latestMessageId: number;
  acct: { id: number; name: string; slug: string } | null;
  flagged: boolean;
  archived: boolean;
  threadMsgs: ThreadMsg[];
  triage: ThreadTriage | null;
  externalParticipants: ThreadParticipant[];
  internalParticipants: ThreadParticipant[];
  senderSuggestion: {
    address: string;
    name: string | null;
    suggestion: { accountId: number; name: string } | null;
    accounts: { id: number; name: string }[];
  } | null;
  // dev-feedback #13: always-available manual account link/unlink, independent
  // of senderSuggestion (which only fires for an unmapped EXTERNAL sender and
  // stays null for an all-internal thread). accountManual flags a thread
  // Jordan explicitly linked/unlinked, so the AI/domain auto-mappers skip it.
  accounts: { id: number; name: string }[];
  accountManual: boolean;
  docSuggestions: Awaited<ReturnType<typeof suggestDocsForThread>>;
  taskSuggestions: TaskSuggestion[];
  quoteHref: string | null;
  // dev-feedback #11: smart task<->email linkage. taskEmailSuggestions is
  // suggestion-only ("this email may complete..."), scored against the
  // latest inbound message; linkedTasks is the CONFIRMED set already stored
  // in task_emails for any message in this thread.
  taskEmailSuggestions: (TaskEmailMatch & { title: string })[];
  linkedTasks: LinkedTaskRef[];
  latestInboundEmailId: number | null;
}

// Assemble the full thread view payload. Returns null when the thread has no
// messages. Marks the thread read as a side effect (opening it = reading it).
export async function getThreadViewData(key: string): Promise<ThreadViewData | null> {
  const { subject, messages } = await getThread(key);
  if (messages.length === 0) return null;

  const acctId = messages.find((m) => m.accountId != null)?.accountId ?? null;
  const acct = acctId != null ? (await accountNames([acctId])).get(acctId) : undefined;
  // dev-feedback #13: manual override state rides on the message row, not the
  // resolved account, so it reads true whether or not acctId resolved.
  const accountManual = messages.some((m) => m.accountManual);
  const allAccounts = await listDbAccounts().catch(() => []);

  // Opening a thread marks it read in the inbox.
  await markRead(messages.map((m) => m.id)).catch(() => {});

  const flagged = messages.some((m) => m.flagged);
  const archived = messages[messages.length - 1].status === "archived";
  // Reply targets the most recent inbound message (reply to the customer).
  // A message FROM one of Jordan's own addresses is outbound even when the
  // capture flow missed the tag; never anchor a reply on his own mail.
  const latestInbound = [...messages]
    .reverse()
    .find((m) => msgDirection(m) === "inbound");

  // Sending identities on this thread (Jordan + any outbound sender): never
  // reply to ourselves.
  const self = new Set<string>([JORDAN]);
  for (const m of messages) {
    if (msgDirection(m) === "outbound" && m.fromEmail) self.add(m.fromEmail.toLowerCase());
  }
  const everyone = new Set<string>();
  for (const m of messages) {
    if (m.fromEmail) everyone.add(m.fromEmail.toLowerCase());
    for (const r of m.recipients ?? []) if (r?.email) everyone.add(r.email.toLowerCase());
  }

  // Contact cards for everyone on the thread (name-first chips with the
  // address + title/account on hover).
  const cards = await personCardsForEmails([...everyone]).catch(
    () => new Map<string, PersonCard>(),
  );

  // Conversation view: newest first, each message carrying its own reply set.
  const threadMsgs: ThreadMsg[] = [...messages]
    .reverse()
    .map((m) => toThreadMsg(m, self, cards));

  // Participant map: everyone on the thread (minus Jordan), split into external
  // (customer) and internal (Merit) with display names.
  const nameByEmail = new Map<string, string>();
  for (const m of messages) {
    if (m.fromEmail) nameByEmail.set(m.fromEmail.toLowerCase(), m.fromName?.trim() || m.fromEmail);
    for (const r of m.recipients ?? []) if (r?.email) nameByEmail.set(r.email.toLowerCase(), r.name?.trim() || r.email);
  }
  const participants = [...everyone]
    .filter((a) => a !== JORDAN)
    .map((a) => ({ email: a, name: nameByEmail.get(a) ?? a, internal: isInternal(a) }));
  const externalParticipants = participants
    .filter((p) => !p.internal)
    .map(({ email, name }) => ({ email, name }));
  const internalParticipants = participants
    .filter((p) => p.internal)
    .map(({ email, name }) => ({ email, name }));

  // Ensure this thread is triaged (one Haiku call when stale), then read it back.
  let triage: TriageRow | null = null;
  if (aiConfigured()) {
    await ensureTriageForKeys([key], 1).catch(() => {});
    triage = (await getTriageMap([key])).get(key) ?? null;
  }
  // A review only counts until the next inbound message: new mail from the
  // other side reopens the thread as unreviewed.
  if (triage?.reviewed && latestInbound) {
    const lastInboundAt =
      latestInbound.sentAt ?? latestInbound.receivedAt ?? latestInbound.createdAt;
    if (lastInboundAt && (!triage.reviewedAt || triage.reviewedAt < lastInboundAt)) {
      triage = { ...triage, reviewed: false };
    }
  }

  // Smart Action panel: suggested related open tasks. Only when the thread is
  // mapped to a customer account and is not noise/FYI, so we never suggest
  // linking a newsletter to an unrelated customer.
  const relevantForActions =
    Boolean(acct?.name) && triage?.pathway !== "noise" && triage?.pathway !== "fyi";
  const suggestText = `${subject} ${triage?.summary ?? ""}`;
  const taskSuggestions = relevantForActions
    ? await suggestTasksForThread(acct?.name ?? null, suggestText, 3).catch(() => [])
    : [];

  // Task<->email smart linkage (dev-feedback #11): suggestion-only, scored
  // against the latest inbound message's actual text (not just the triage
  // summary), so a sender name or part number the triage summary drops still
  // scores. Same noise/FYI gate as the doc suggestions below.
  const taskEmailSuggestions =
    latestInbound && triage?.pathway !== "noise" && triage?.pathway !== "fyi"
      ? await suggestTasksForEmail(
          {
            accountName: acct?.name ?? null,
            subject,
            bodyText: formatEmailBody(latestInbound).main,
            fromName: latestInbound.fromName,
            fromEmail: latestInbound.fromEmail,
          },
          latestInbound.id,
          3,
        ).catch(() => [])
      : [];
  const linkedTasks = await linkedTasksForEmailIds(messages.map((m) => m.id)).catch(() => []);

  // Quote handoff: a thread triaged as a quote request gets a one-tap "Create
  // quote" that opens the Quote builder prefilled (customer, contact) with the
  // email text queued to auto-parse into line items.
  const isQuoteRequest = triage?.pathway === "quote-request";
  const quoteParseText =
    isQuoteRequest && latestInbound
      ? `${subject}\n${(latestInbound.bodyText ?? latestInbound.bodyPreview ?? "").slice(0, 1500)}`
      : "";
  const quoteHref = isQuoteRequest
    ? `/quote?customer=${encodeURIComponent(acct?.name ?? "")}&contact=${encodeURIComponent(
        latestInbound?.fromName?.trim() || latestInbound?.fromEmail || "",
      )}&parse=${encodeURIComponent(quoteParseText)}`
    : null;

  // Suggest-attach: library documents relevant to this thread, so a reply can
  // reference the right spec/cert/quote. Only when there is a reply to write and
  // the thread is not noise/FYI.
  const docSuggestions =
    latestInbound && triage?.pathway !== "noise" && triage?.pathway !== "fyi"
      ? await suggestDocsForThread(acct?.name ?? null, suggestText, 3).catch(() => [])
      : [];

  // Sender suggestion: only for an EXTERNAL, unmapped inbound sender. Internal
  // (@merit.com / meritoem.com) is never a customer, so no card. Offer both the
  // domain suggestion and a manual picker over all accounts.
  let senderSuggestion: ThreadViewData["senderSuggestion"] = null;
  if (acctId == null && latestInbound?.fromEmail && !isInternal(latestInbound.fromEmail)) {
    const s = await suggestAccountForEmail(latestInbound.fromEmail).catch(() => null);
    senderSuggestion = {
      address: latestInbound.fromEmail,
      name: latestInbound.fromName ?? null,
      suggestion: s ? { accountId: s.accountId, name: s.name } : null,
      accounts: allAccounts,
    };
  }

  return {
    subject,
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    latestMessageId: messages[messages.length - 1].id,
    acct: acct && acctId != null ? { id: acctId, name: acct.name, slug: acct.slug } : null,
    flagged,
    archived,
    threadMsgs,
    triage: triage
      ? {
          pathway: triage.pathway,
          reviewed: triage.reviewed,
          summary: triage.summary,
          model: triage.model,
          aiGenerated: triage.aiGenerated,
          manual: triage.manual,
          priority: triage.priority,
          needsReply: triage.needsReply,
        }
      : null,
    externalParticipants,
    internalParticipants,
    senderSuggestion,
    accounts: allAccounts,
    accountManual,
    docSuggestions,
    taskSuggestions,
    quoteHref,
    taskEmailSuggestions,
    linkedTasks,
    latestInboundEmailId: latestInbound?.id ?? null,
  };
}

// Serialize a message for the client conversation view: cleaned body split
// from its quoted history, internal/external, and the reply-all set anchored
// to THIS message (inbound: reply to the sender + copy the rest; outbound:
// follow up with the same recipients).
function personRef(
  email: string,
  fallbackName: string | null | undefined,
  cards: Map<string, PersonCard>,
): PersonRef {
  const card = cards.get(email);
  const fallback = fallbackName?.trim();
  const name =
    card?.fullName ??
    (fallback && !fallback.includes("@") ? fallback : prettyLocalPart(email));
  return {
    email,
    name,
    title: card?.title ?? null,
    accountName: card?.accountName ?? null,
    internal: isInternal(email) || card?.classification === "internal",
  };
}

// Outlook embeds images as attachments referenced by src="cid:image001.png@...".
// We don't store the content id, but the cid's local part is the file name in
// practice, so match on that and point the src at our attachment endpoint.
// Unmatched cids are left alone (they render as a broken image either way).
function rewriteCidImages(
  html: string | null,
  atts: Array<{ id: number; fileName: string | null; blobUrl: string | null }>,
): string | null {
  if (!html || !html.toLowerCase().includes("cid:")) return html;
  return html.replace(
    /(src\s*=\s*["'])cid:([^"']+)(["'])/gi,
    (full, pre: string, cid: string, post: string) => {
      const c = decodeURIComponent(cid).toLowerCase();
      const hit = atts.find((a) => {
        if (!a.blobUrl || !a.fileName) return false;
        const fn = a.fileName.toLowerCase();
        return c === fn || c.startsWith(`${fn}@`) || c.includes(fn);
      });
      return hit ? `${pre}/api/email-attachments/file?id=${hit.id}${post}` : full;
    },
  );
}

// Find where quoted history starts in an HTML email body so the thread view
// can show ONLY this message's own content (the chain is already separated
// into cards). Recognizes the Outlook and Gmail reply separators; returns a
// slice index into the html, or null when no boundary is found. Exported for
// tests: this is pure string work.
export function htmlQuoteCut(html: string): number | null {
  const lower = html.toLowerCase();
  const candidates: number[] = [];
  const consider = (idx: number) => {
    // A boundary in the first bytes would leave nothing; treat as no cut.
    if (idx > 200) candidates.push(idx);
  };
  for (const marker of [
    'id="divrplyfwdmsg"',
    "id='divrplyfwdmsg'",
    'class="gmail_quote',
    "class='gmail_quote",
  ]) {
    const i = lower.indexOf(marker);
    if (i !== -1) consider(backtrackToTagStart(lower, i));
  }
  const bq = lower.indexOf("<blockquote");
  if (bq !== -1) consider(bq);
  // Desktop Outlook: a thin top border followed by the From:/Sent: header.
  const border = lower.indexOf("border-top:solid #e1e1e1");
  if (border !== -1) consider(backtrackToTagStart(lower, border));
  const fromHdr = lower.search(/<b>\s*from:\s*<\/b>/);
  if (fromHdr !== -1) consider(backtrackToTagStart(lower, fromHdr));
  return candidates.length ? Math.min(...candidates) : null;
}

function backtrackToTagStart(lower: string, idx: number): number {
  const div = lower.lastIndexOf("<div", idx);
  const p = lower.lastIndexOf("<p", idx);
  const hr = lower.lastIndexOf("<hr", idx);
  const best = Math.max(div, p, hr);
  return best > 0 ? best : idx;
}

// Last-resort display name from the address local part: "jordan.francis" ->
// "Jordan Francis"; a separator-free local part just gets capitalized.
export function prettyLocalPart(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (!parts.length) return email;
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

function toThreadMsg(
  m: ThreadMessage,
  selfSet: Set<string>,
  cards: Map<string, PersonCard>,
): ThreadMsg {
  const { main, quoted } = formatEmailBody(m);
  const html = rewriteCidImages(
    m.bodyHtml?.trim() || null,
    [...(m.inlineAttachments ?? []), ...m.attachments],
  );
  const recips = (m.recipients ?? [])
    .filter((r) => r?.email && r.role !== "from")
    .map((r) => ({ email: r.email.toLowerCase(), name: r.name ?? r.email, cc: r.role === "cc" }));
  const from = m.fromEmail?.toLowerCase() ?? null;
  const dir = msgDirection(m);

  let replyTo: string[] = [];
  let replyCc: string[] = [];
  if (dir === "inbound" && from) {
    replyTo = [from];
    replyCc = dedupe(recips.map((r) => r.email).filter((a) => !selfSet.has(a) && a !== from));
  } else {
    // Outbound: continue to the same audience.
    replyTo = dedupe(recips.filter((r) => !r.cc).map((r) => r.email).filter((a) => !selfSet.has(a)));
    replyCc = dedupe(recips.filter((r) => r.cc).map((r) => r.email).filter((a) => !selfSet.has(a)));
    if (!replyTo.length) replyTo = replyCc.splice(0, replyCc.length);
  }

  return {
    id: m.id,
    direction: dir,
    internal: from ? isInternal(from) : dir === "outbound",
    from: personRef(from ?? "", m.fromName, cards),
    recipients: recips.map((r) => personRef(r.email, r.name, cards)),
    atLabel: fmt(m.sentAt ?? m.receivedAt ?? m.createdAt),
    bodyMain: main,
    bodyQuoted: quoted,
    bodyHtml: html,
    bodyHtmlCut: html ? htmlQuoteCut(html) : null,
    flagged: m.flagged,
    attachments: m.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
      isImage: a.isImage,
      isPdf: a.contentType === "application/pdf",
      hasBlob: Boolean(a.blobUrl),
    })),
    replyTo,
    replyCc,
  };
}

// Direction with the self-address guard: the Sent-capture flow does not
// always tag Jordan's messages outbound; his own address settles it.
function msgDirection(m: Pick<ThreadMessage, "direction" | "fromEmail">): "inbound" | "outbound" {
  if (m.direction === "outbound") return "outbound";
  return m.fromEmail && isSelfAddress(m.fromEmail) ? "outbound" : "inbound";
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function fmt(d: Date | null): string {
  if (!d) return "";
  // Render in the app timezone; the server runs in UTC, so without this an
  // email shows hours ahead of when it actually arrived.
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: appTimezone(),
  });
}
