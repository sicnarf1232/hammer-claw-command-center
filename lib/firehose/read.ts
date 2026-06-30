import { get } from "@vercel/blob";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails, emailAttachments, accounts } from "@/lib/db/schema";

export type EmailRow = typeof emails.$inferSelect;
export type AttachmentRow = typeof emailAttachments.$inferSelect;

export interface ThreadSummary {
  key: string; // URL-safe thread key
  subject: string;
  lastAt: Date | null;
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

  type Acc = ThreadSummary & { _parties: Set<string>; _latestStatus: string };
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
        count: 0,
        inbound: 0,
        outbound: 0,
        parties: [],
        _parties: new Set<string>(),
        _latestStatus: e.status ?? "new",
        accountId: e.accountId ?? null,
        needsReview: false,
        hasAttachments: false,
        flagged: false,
        archived: false,
        replied: false,
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
    if (e.direction !== "outbound") t._parties.add(partyLabel(e));
    // Newest message in the group sets subject, time, and the thread's status.
    if (at && (!t.lastAt || at > t.lastAt)) {
      t.lastAt = at;
      t.subject = cleanSubject(e.subject) || t.subject;
      t._latestStatus = e.status ?? "new";
    }
  }

  let out = Array.from(byKey.values()).map((t) => {
    t.parties = Array.from(t._parties).slice(0, 4);
    t.archived = t._latestStatus === "archived";
    return t as ThreadSummary;
  });

  if (accountId != null) out = out.filter((t) => t.accountId === accountId);
  if (view === "attention") out = out.filter((t) => (t.flagged || t.needsReview) && !t.archived);
  else if (view === "flagged") out = out.filter((t) => t.flagged && !t.archived);

  out.sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
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
