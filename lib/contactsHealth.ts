import { sql } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";
import { listAccounts } from "@/lib/accounts";
import { todayISO } from "@/lib/dates";

export interface PersonHealth {
  name: string;
  title: string | null;
  email: string | null;
  accountName: string;
  accountSlug: string;
  accountColorKey: string;
  primary: boolean;
  lastEmailISO: string | null;
  daysSince: number | null;
  pendingReply: boolean;
  goneQuiet: boolean;
}

export interface AccountTouch {
  name: string;
  slug: string;
  primaryContact: string | null;
  lastEmailISO: string | null;
  daysSince: number | null;
  pendingReply: boolean;
}

export interface ContactsHealth {
  today: string;
  people: PersonHealth[];
  needsAttention: PersonHealth[];
  accounts: AccountTouch[];
}

const QUIET_DAYS = 14;

function daysSince(iso: string | null, today: string): number | null {
  if (!iso) return null;
  const a = new Date(iso).getTime();
  const b = new Date(today + "T23:59:59").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

// Relationship health across every mapped customer contact. Last-email dates and
// pending-reply flags are derived from the firehose emails table by matching a
// contact's email against sender/recipient addresses.
export async function getContactsHealth(): Promise<ContactsHealth> {
  const today = todayISO();
  const accounts = await listAccounts().catch(() => []);

  // Collect (contact, account) pairs that carry an email we can match on.
  const contacts = accounts.flatMap((a) =>
    (a.contacts ?? []).map((c, i) => ({
      name: c.name,
      title: c.title ?? c.detail ?? null,
      email: c.email ? c.email.trim().toLowerCase() : null,
      accountName: a.name,
      accountSlug: a.slug,
      primary: i === 0,
    })),
  );

  const addresses = Array.from(new Set(contacts.map((c) => c.email).filter((e): e is string => !!e)));
  const { lastInbound, lastOutbound, awaiting } = await emailSignals(addresses);

  const people: PersonHealth[] = contacts.map((c) => {
    const inbound = c.email ? lastInbound.get(c.email) ?? null : null;
    const outbound = c.email ? lastOutbound.get(c.email) ?? null : null;
    // Latest touch either direction, for the "days ago" display.
    const last = [inbound, outbound].filter(Boolean).sort().pop() ?? null;
    const ds = daysSince(last, today);
    const pendingReply = Boolean(
      c.email && (awaiting.has(c.email) || (inbound && (!outbound || outbound < inbound))),
    );
    return {
      name: c.name,
      title: c.title,
      email: c.email,
      accountName: c.accountName,
      accountSlug: c.accountSlug,
      accountColorKey: c.accountName,
      primary: c.primary,
      lastEmailISO: last,
      daysSince: ds,
      pendingReply,
      goneQuiet: ds != null && ds > QUIET_DAYS,
    };
  });

  const needsAttention = people
    .filter((p) => p.pendingReply || p.goneQuiet)
    .sort((a, b) => Number(b.pendingReply) - Number(a.pendingReply) || (b.daysSince ?? 0) - (a.daysSince ?? 0));

  // One touch row per account for the right rail.
  const byAccount = new Map<string, AccountTouch>();
  for (const p of people) {
    let row = byAccount.get(p.accountSlug);
    if (!row) {
      row = { name: p.accountName, slug: p.accountSlug, primaryContact: null, lastEmailISO: null, daysSince: null, pendingReply: false };
      byAccount.set(p.accountSlug, row);
    }
    if (p.primary) row.primaryContact = p.name;
    if (p.lastEmailISO && (!row.lastEmailISO || p.lastEmailISO > row.lastEmailISO)) {
      row.lastEmailISO = p.lastEmailISO;
      row.daysSince = p.daysSince;
    }
    if (p.pendingReply) row.pendingReply = true;
  }
  const accountsTouch = Array.from(byAccount.values()).sort(
    (a, b) => Number(b.pendingReply) - Number(a.pendingReply) || (b.daysSince ?? -1) - (a.daysSince ?? -1),
  );

  return { today, people, needsAttention, accounts: accountsTouch };
}

async function emailSignals(addresses: string[]): Promise<{
  lastInbound: Map<string, string>;
  lastOutbound: Map<string, string>;
  awaiting: Set<string>;
}> {
  const lastInbound = new Map<string, string>();
  const lastOutbound = new Map<string, string>();
  const awaiting = new Set<string>();
  if (!dbConfigured() || addresses.length === 0) return { lastInbound, lastOutbound, awaiting };

  try {
    const db = getDb();
    const list = sql.join(addresses.map((a) => sql`${a}`), sql`, `);

    // Last time each address emailed us (inbound).
    const inb = await db.execute(sql`
      select lower(from_email) as addr,
             max(coalesce(received_at, sent_at, created_at)) as t
      from emails
      where direction = 'inbound' and lower(from_email) in (${list})
      group by 1
    `);
    for (const r of rowsOf(inb)) {
      if (r.addr && r.t) lastInbound.set(String(r.addr), new Date(r.t as string).toISOString());
    }

    // Last time we emailed each address (outbound). Pull outbound recipients once
    // and match in JS (jsonb "contains" is awkward and this set is bounded).
    const out = await db.execute(sql`
      select lower(to_addrs::text) as tos, coalesce(sent_at, received_at, created_at) as t
      from emails
      where direction = 'outbound'
      order by t desc
      limit 2000
    `);
    for (const r of rowsOf(out)) {
      const tos = String(r.tos ?? "");
      const t = r.t ? new Date(r.t as string).toISOString() : null;
      if (!t) continue;
      for (const addr of addresses) {
        if (tos.includes(addr) && !lastOutbound.has(addr)) lastOutbound.set(addr, t);
      }
    }

    // Addresses on a currently-flagged inbound message → we likely owe a reply.
    const flag = await db.execute(sql`
      select distinct lower(from_email) as addr
      from emails
      where flagged = true and direction = 'inbound' and lower(from_email) in (${list})
    `);
    for (const r of rowsOf(flag)) if (r.addr) awaiting.add(String(r.addr));
  } catch {
    // Firehose tables absent or query failed: no signals, page still renders.
  }

  return { lastInbound, lastOutbound, awaiting };
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}
