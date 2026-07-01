import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { MERIT_DOMAINS } from "./map";

// Domain -> account mapping. Linking a sender links their whole company domain, so
// every current and future address on that domain (e.g. anyone @stryker.com) maps
// to the account automatically. Self-provisioned like the firehose. Free-mail and
// internal domains are never domain-linked (they are not a single company).

export const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "comcast.net",
  "verizon.net", "att.net",
]);

export function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

// A domain we should never blanket-map to one customer account.
export function isLinkableDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d || GENERIC_DOMAINS.has(d)) return false;
  if (MERIT_DOMAINS.some((m) => d === m || d.endsWith("." + m))) return false;
  return true;
}

let ensured: Promise<void> | null = null;
async function ensureDomainSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await getDb().execute(
      sql.raw(
        `create table if not exists account_domains (
           domain text primary key,
           account_id integer not null,
           created_at timestamptz not null default now()
         )`,
      ),
    );
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}

// domain -> accountId, for the firehose to auto-map new mail. Empty on any error.
export async function loadDomainMap(): Promise<Map<string, number>> {
  if (!dbConfigured()) return new Map();
  try {
    await ensureDomainSchema();
    const res = await getDb().execute(sql`select domain, account_id from account_domains`);
    const rows = Array.isArray(res)
      ? (res as { domain: string; account_id: number }[])
      : (((res as { rows?: unknown }).rows ?? []) as { domain: string; account_id: number }[]);
    const m = new Map<string, number>();
    for (const r of rows) m.set(String(r.domain), Number(r.account_id));
    return m;
  } catch {
    return new Map();
  }
}

// Link a whole domain to an account: remember it (so future mail auto-maps) and
// backfill every unmapped email and person on that domain. No-op for generic /
// internal domains.
export async function linkDomainToAccount(domain: string, accountId: number): Promise<boolean> {
  const d = domain.trim().toLowerCase();
  if (!isLinkableDomain(d)) return false;
  await ensureDomainSchema();
  const db = getDb();
  await db.execute(
    sql`insert into account_domains (domain, account_id) values (${d}, ${accountId})
        on conflict (domain) do update set account_id = ${accountId}`,
  );
  // Backfill unmapped mail + people on this domain.
  await db.execute(
    sql`update emails set account_id = ${accountId}, needs_review = false
         where lower(split_part(from_email, '@', 2)) = ${d} and account_id is null`,
  );
  await db.execute(
    sql`update people set account_id = ${accountId}
         where lower(split_part(email, '@', 2)) = ${d} and account_id is null`,
  );
  return true;
}
