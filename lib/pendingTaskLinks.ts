import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { linkTasksToEmail } from "@/lib/emailTaskLinks";

// Best-effort task<->email linking for a brand-new outbound email that has no
// DB row yet at send time (dev-feedback #15, part 3). Flow B's send call
// (lib/powerAutomate.ts postMailIntent) returns only {ok,status,body}, no
// message id: the real `emails` row lands later, asynchronously, whenever the
// outbound-capture webhook processes the Sent-folder sync
// (lib/firehose/store.ts storeFirehoseEmail). Rather than block sending on a
// synchronous id, the compose page queues a pending row here; the capture
// path reconciles it once the message actually shows up.
//
// This is deliberately self-provisioned (create table if not exists), not
// added to lib/db/schema.ts / lib/cutover/schema.ts: dev-feedback #14's
// concurrent rebuild is actively editing both of those files, and the rest of
// this codebase already treats a lazy CREATE in the feature's own module as
// the normal pattern for a small additive table (see lib/taskMeta.ts,
// lib/firehose/domains.ts's account_domains).

let ensured: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await getDb().execute(sql`
      create table if not exists pending_task_links (
        id serial primary key,
        subject text,
        to_addrs jsonb not null default '[]'::jsonb,
        task_ids jsonb not null default '[]'::jsonb,
        resolved boolean not null default false,
        created_at timestamptz not null default now()
      )
    `);
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

export interface PendingLinkRecord {
  subject: string | null;
  toAddrs: string[];
  createdAt: Date;
}

export interface CapturedEmailInfo {
  subject: string | null;
  toAddrs: string[];
  sentAt: Date;
}

const WINDOW_MS = 30 * 60 * 1000; // pending link must resolve within 30 minutes
const CLOCK_SLACK_MS = 5 * 60 * 1000; // captured timestamp can lag the pending row slightly

function normalizeSubject(s: string | null): string {
  let out = (s ?? "").trim().toLowerCase();
  // strip a small stack of reply/forward prefixes ("Re: Fw: ..."), same idea
  // as lib/firehose/read.ts's cleanSubject but local so this stays pure and
  // dependency-free for the unit tests below.
  for (let i = 0; i < 3; i++) {
    const stripped = out.replace(/^(re|fw|fwd)\s*:\s*/i, "");
    if (stripped === out) break;
    out = stripped;
  }
  return out.replace(/\s+/g, " ").trim();
}

// Pure match: same normalized subject, at least one overlapping recipient,
// and the captured send falls inside the reconciliation window. Exported so
// this is unit-testable without a database. Best-effort by design: a subject
// altered after task selection (e.g. by AI drafting) will not match, and that
// is an accepted gap rather than something this function tries to fuzzy-fix.
export function pendingLinkMatches(pending: PendingLinkRecord, captured: CapturedEmailInfo): boolean {
  const subjA = normalizeSubject(pending.subject);
  const subjB = normalizeSubject(captured.subject);
  if (!subjA || !subjB || subjA !== subjB) return false;

  const pendingAddrs = new Set(pending.toAddrs.map((a) => a.toLowerCase().trim()).filter(Boolean));
  if (!pendingAddrs.size) return false;
  const overlaps = captured.toAddrs.some((a) => pendingAddrs.has(a.toLowerCase().trim()));
  if (!overlaps) return false;

  const delta = captured.sentAt.getTime() - pending.createdAt.getTime();
  return delta >= -CLOCK_SLACK_MS && delta <= WINDOW_MS;
}

// Queue a pending link right after a successful send from the compose page.
export async function createPendingLink(
  subject: string,
  toAddrs: string[],
  taskIds: string[],
): Promise<void> {
  if (!dbConfigured() || !taskIds.length) return;
  await ensureSchema();
  await getDb().execute(sql`
    insert into pending_task_links (subject, to_addrs, task_ids)
    values (${subject}, ${JSON.stringify(toAddrs)}::jsonb, ${JSON.stringify(taskIds)}::jsonb)
  `);
}

// Called from the outbound-capture path right after a NEW email row is
// inserted. Never throws: capturing the email must succeed regardless of
// whether a pending link resolves.
export async function reconcilePendingTaskLinks(captured: {
  emailId: number;
  subject: string | null;
  toAddrs: string[];
  sentAt: Date;
}): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await ensureSchema();
    const db = getDb();
    const since = new Date(captured.sentAt.getTime() - WINDOW_MS - CLOCK_SLACK_MS).toISOString();
    const res = await db.execute(sql`
      select id, subject, to_addrs, task_ids, created_at from pending_task_links
      where resolved = false and created_at >= ${since}
    `);
    for (const r of rowsOf(res)) {
      const pending: PendingLinkRecord = {
        subject: r.subject == null ? null : String(r.subject),
        toAddrs: Array.isArray(r.to_addrs) ? (r.to_addrs as string[]) : [],
        createdAt: new Date(r.created_at as string),
      };
      if (
        !pendingLinkMatches(pending, {
          subject: captured.subject,
          toAddrs: captured.toAddrs,
          sentAt: captured.sentAt,
        })
      ) {
        continue;
      }
      const taskIds = Array.isArray(r.task_ids) ? (r.task_ids as string[]).map(String) : [];
      if (taskIds.length) {
        await linkTasksToEmail(taskIds, captured.emailId).catch(() => {});
      }
      await db.execute(sql`update pending_task_links set resolved = true where id = ${r.id}`);
    }
  } catch {
    // Best-effort: a reconciliation failure must never break email capture.
  }
}
