import { get } from "@vercel/blob";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails, emailAttachments, accounts } from "@/lib/db/schema";
import { isInlineAttachment } from "./attach";

export type EmailRow = typeof emails.$inferSelect;
export type AttachmentRow = typeof emailAttachments.$inferSelect;

export interface ThreadSummary {
  key: string; // URL-safe thread key
  subject: string;
  lastAt: Date | null;
  lastInboundAt: Date | null; // newest message someone ELSE sent
  count: number;
  inbound: number;
  outbound: number;
  parties: string[]; // distinct non-self display names/emails
  accountId: number | null;
  needsReview: boolean;
  hasAttachments: boolean;
  flagged: boolean;
  archived: boolean;
  replied: boolean;
  preview: string | null; // newest message snippet
  lastDirection: "inbound" | "outbound";
  unread: boolean; // newest message is inbound and still status 'new'
}

export type InboxView = "attention" | "flagged" | "all";

export interface ListThreadsOpts {
  view?: InboxView;
  accountId?: number;
  limit?: number;
}

// A thread key is the conversationId when present, else a per-message key so a
// standalone message still gets its own row.
function threadKey(e: Pick<EmailRow, "threadId" | "id">): string {
  return e.threadId ? `t:${e.threadId}` : `m:${e.id}`;
}

function timeOf(e: Pick<EmailRow, "sentAt" | "receivedAt" | "createdAt">): Date | null {
  return e.sentAt ?? e.receivedAt ?? e.createdAt ?? null;
}

function partyLabel(e: EmailRow): string {
  return e.fromName?.trim() || e.fromEmail || "Unknown";
}

// Group the most recent messages into threads, newest activity first. Filtered
// by view: attention = flagged or needs-review (and not archived); flagged =
// flagged only; all = everything. An optional accountId scopes to one account.
export async function listThreads(opts: ListThreadsOpts = {}): Promise<ThreadSummary[]> {
  const { view = "all", accountId, limit = 80 } = opts;
  if (!dbConfigured()) return [];
  const db = getDb();
  let rows: EmailRow[];
  try {
    rows = await db
      .select()
      .from(emails)
      .orderBy(desc(sql`coalesce(${emails.sentAt}, ${emails.receivedAt}, ${emails.createdAt})`))
      .limit(800);
  } catch {
    // Tables not provisioned yet (no firehose traffic): show empty, not an error.
    return [];
  }

  type Acc = ThreadSummary & {
    _parties: Set<string>;
    _latestStatus: string;
    _newestRead: boolean;
    _inboundPreview: string | null;
  };
  const byKey = new Map<string, Acc>();
  for (const e of rows) {
    const key = threadKey(e);
    const at = timeOf(e);
    let t = byKey.get(key);
    if (!t) {
      t = {
        key,
        subject: cleanSubject(e.subject) || "(no subject)",
        lastAt: at,
        lastInboundAt: null,
        _inboundPreview: null,
        count: 0,
        inbound: 0,
        outbound: 0,
        parties: [],
        _parties: new Set<string>(),
        _latestStatus: e.status ?? "new",
        _newestRead: false,
        accountId: e.accountId ?? null,
        needsReview: false,
        hasAttachments: false,
        flagged: false,
        archived: false,
        replied: false,
        preview: null,
        lastDirection: "inbound",
        unread: false,
      };
      byKey.set(key, t);
    }
    t.count++;
    if (e.direction === "outbound") t.outbound++;
    else t.inbound++;
    if (e.hasAttachments) t.hasAttachments = true;
    if (e.needsReview) t.needsReview = true;
    if (e.flagged) t.flagged = true;
    if (e.status === "replied") t.replied = true;
    if (e.accountId != null && t.accountId == null) t.accountId = e.accountId;
    if (e.direction !== "outbound") {
      t._parties.add(partyLabel(e));
      // The newest INBOUND message anchors the list: Jordan's own replies
      // stay in the thread but don't resurface it as new activity.
      if (at && (!t.lastInboundAt || at > t.lastInboundAt)) {
        t.lastInboundAt = at;
        t._inboundPreview = (e.bodyPreview ?? e.bodyText ?? "")?.slice(0, 160) || null;
      }
    }
    // Newest message in the group sets subject, time, status, preview, direction.
    if (at && (!t.lastAt || at > t.lastAt)) {
      t.lastAt = at;
      t.subject = cleanSubject(e.subject) || t.subject;
      t._latestStatus = e.status ?? "new";
      t._newestRead = Boolean(e.read);
      t.preview = (e.bodyPreview ?? e.bodyText ?? "")?.slice(0, 160) || null;
      t.lastDirection = e.direction === "outbound" ? "outbound" : "inbound";
    }
  }

  let out = Array.from(byKey.values()).map((t) => {
    t.parties = Array.from(t._parties).slice(0, 4);
    t.archived = t._latestStatus === "archived";
    // Unread = the newest message is one Jordan received and has not opened.
    t.unread = t.lastDirection === "inbound" && !t._newestRead;
    // Preview leads with what THEY said last, not Jordan's own reply.
    if (t._inboundPreview) t.preview = t._inboundPreview;
    return t as ThreadSummary;
  });

  if (accountId != null) out = out.filter((t) => t.accountId === accountId);
  if (view === "attention") out = out.filter((t) => (t.flagged || t.needsReview) && !t.archived);
  else if (view === "flagged") out = out.filter((t) => t.flagged && !t.archived);

  out.sort(
    (a, b) =>
      ((b.lastInboundAt ?? b.lastAt)?.getTime() ?? 0) -
      ((a.lastInboundAt ?? a.lastAt)?.getTime() ?? 0),
  );
  return out.slice(0, limit);
}

// Counts for the inbox tabs (attention / flagged / all), one cheap pass.
export async function threadCounts(): Promise<{
  attention: number;
  flagged: number;
  all: number;
}> {
  const all = await listThreads({ view: "all", limit: 100000 });
  return {
    all: all.length,
    attention: all.filter((t) => (t.flagged || t.needsReview) && !t.archived).length,
    flagged: all.filter((t) => t.flagged && !t.archived).length,
  };
}

// Resolve a thread key ("t:<threadId>" | "m:<id>") to its message ids, so
// key-addressable actions (inbox hover actions, task send-update) can act on a
// whole thread without shipping ids to the client.
export async function emailIdsForThreadKey(key: string): Promise<number[]> {
  if (!dbConfigured()) return [];
  if (key.startsWith("m:")) {
    const id = Number(key.slice(2));
    return Number.isInteger(id) ? [id] : [];
  }
  if (key.startsWith("t:")) {
    const threadId = key.slice(2);
    const rows = await getDb()
      .select({ id: emails.id })
      .from(emails)
      .where(eq(emails.threadId, threadId));
    return rows.map((r) => r.id);
  }
  return [];
}

// The slice of an email row pickReplyTarget needs (pure; also test-friendly).
export interface ReplyTargetMessage {
  id: number;
  direction: string;
  messageId: string | null;
  fromEmail: string | null;
  toAddrs: string[] | null;
  cc: string[] | null;
  subject: string | null;
  sentAt: Date | null;
  receivedAt: Date | null;
}

export interface ReplyTarget {
  emailId: number;
  messageId: string;
  subject: string | null;
  to: string[];
  cc: string[];
}

// Pure: pick the newest INBOUND message with a message id as the reply anchor,
// and derive the reply-all recipient set (sender + other recipients, minus the
// sending identity itself). Returns null when the thread has nothing to anchor
// a reply to.
export function pickReplyTarget(
  messages: ReplyTargetMessage[],
  selfEmail: string,
): ReplyTarget | null {
  const timeOfMsg = (m: ReplyTargetMessage) =>
    (m.sentAt ?? m.receivedAt)?.getTime() ?? 0;
  const anchor = messages
    .filter((m) => m.direction === "inbound" && m.messageId)
    .sort((a, b) => timeOfMsg(a) - timeOfMsg(b))
    .pop();
  if (!anchor || !anchor.fromEmail) return null;

  const self = selfEmail.toLowerCase();
  const seen = new Set<string>([self]);
  const add = (list: string[], addr: string | null | undefined) => {
    const a = (addr ?? "").trim();
    if (!a) return;
    const key = a.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(a);
  };

  const to: string[] = [];
  add(to, anchor.fromEmail); // sender first
  for (const a of anchor.toAddrs ?? []) add(to, a);
  const cc: string[] = [];
  for (const a of anchor.cc ?? []) add(cc, a);

  return {
    emailId: anchor.id,
    messageId: anchor.messageId!,
    subject: anchor.subject,
    to,
    cc,
  };
}

export interface ThreadMessage extends EmailRow {
  attachments: AttachmentRow[];
}

export async function getThread(key: string): Promise<{
  subject: string;
  messages: ThreadMessage[];
}> {
  if (!dbConfigured()) return { subject: "", messages: [] };
  const db = getDb();
  const [kind, ...rest] = key.split(":");
  const value = rest.join(":");

  let rows: EmailRow[] = [];
  try {
    if (kind === "t" && value) {
      rows = await db.select().from(emails).where(eq(emails.threadId, value));
    } else if (kind === "m" && value) {
      const id = Number(value);
      if (Number.isInteger(id)) {
        rows = await db.select().from(emails).where(eq(emails.id, id));
      }
    }
  } catch {
    return { subject: "", messages: [] };
  }
  if (rows.length === 0) return { subject: "", messages: [] };

  rows.sort((a, b) => (timeOf(a)?.getTime() ?? 0) - (timeOf(b)?.getTime() ?? 0));

  const ids = rows.map((r) => r.id);
  let atts: AttachmentRow[] = [];
  try {
    atts = await db.select().from(emailAttachments).where(inArray(emailAttachments.emailId, ids));
  } catch {
    atts = [];
  }
  const attByEmail = new Map<number, AttachmentRow[]>();
  for (const a of atts) {
    // Hide inline images (signatures) even for rows stored before the fix.
    if (a.isInline || isInlineAttachment(a.fileName, a.contentType, a.sizeBytes)) continue;
    const list = attByEmail.get(a.emailId) ?? [];
    list.push(a);
    attByEmail.set(a.emailId, list);
  }

  const messages: ThreadMessage[] = rows.map((r) => ({
    ...r,
    attachments: attByEmail.get(r.id) ?? [],
  }));
  const subject = cleanSubject(messages[messages.length - 1].subject) || "(no subject)";
  return { subject, messages };
}

// Best-effort id -> { name, slug } for accounts referenced by threads. Empty if
// the accounts table is absent.
export async function accountNames(
  ids: number[],
): Promise<Map<number, { name: string; slug: string }>> {
  const out = new Map<number, { name: string; slug: string }>();
  const unique = Array.from(new Set(ids.filter((n) => n != null)));
  if (!unique.length || !dbConfigured()) return out;
  try {
    const rows = await getDb()
      .select({ id: accounts.id, name: accounts.name, slug: accounts.slug })
      .from(accounts)
      .where(inArray(accounts.id, unique));
    for (const r of rows) out.set(r.id, { name: r.name, slug: r.slug });
  } catch {
    /* accounts table not present */
  }
  return out;
}

export async function getAttachment(id: number): Promise<AttachmentRow | null> {
  if (!dbConfigured()) return null;
  try {
    const rows = await getDb()
      .select()
      .from(emailAttachments)
      .where(eq(emailAttachments.id, id))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// Open a private attachment blob (server-side, token-authed) for the proxy.
export async function openAttachmentBlob(blobUrl: string) {
  return get(blobUrl, { access: "private" });
}

// Strip a leading RE:/FW: chain for the thread title.
export function cleanSubject(s: string | null): string {
  if (!s) return "";
  return s.replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, "").trim();
}
