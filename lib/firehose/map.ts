import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";

// drizzle's db.execute() returns the rows array on neon-http but a { rows }
// envelope on some drivers; normalize so this code is driver-agnostic.
function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = (res as { rows?: unknown })?.rows;
  return Array.isArray(r) ? (r as T[]) : [];
}

// Address parsing + identity mapping for the firehose. Resolves each address to
// a people row (by email) and, through it, to an account. Unknown senders get a
// people row flagged needs_review so Jordan can confirm/merge later (reuses the
// people identity layer from the DB cutover). All people/account reads are
// best-effort: if those tables are absent, mapping degrades to raw addresses.

export const MERIT_DOMAINS = ["merit.com", "meritoem.com"];

export interface Addr {
  name?: string;
  email: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// Accept an array of {name,email|address} | array of strings | a single string
// ("Doe, John" <j@x.com>; jane@y.com). Returns de-duped {name,email}.
export function parseAddressList(value: unknown): Addr[] {
  const out: Addr[] = [];
  const push = (name: string | undefined, email: string | undefined) => {
    if (!email) return;
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return;
    if (out.some((a) => a.email === e)) return;
    out.push({ name: name?.trim() || undefined, email: e });
  };

  const fromToken = (tok: string) => {
    const angle = tok.match(/<([^>]+)>/);
    if (angle) {
      const name = tok.slice(0, angle.index).replace(/["']/g, "").trim();
      push(name || undefined, angle[1]);
      return;
    }
    const bare = tok.match(EMAIL_RE);
    if (bare) push(undefined, bare[0]);
  };

  const walk = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const email = (o.email ?? o.address ?? o.Address ?? o.emailAddress) as
        | string
        | undefined;
      const name = (o.name ?? o.Name ?? o.displayName) as string | undefined;
      if (email) push(name, email);
    } else if (typeof v === "string") {
      // Split on ; or , but not inside angle brackets / quotes (best-effort).
      v.split(/[;,]/).forEach((t) => t.trim() && fromToken(t));
    }
  };
  walk(value);
  return out;
}

export function isInternal(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return MERIT_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

export interface ResolvedPerson {
  personId: number | null;
  accountId: number | null;
  classification: string;
}

// Look up a person by email; optionally create one for an unknown sender.
async function resolvePerson(
  db: DB,
  addr: Addr,
  opts: { createIfMissing: boolean },
): Promise<ResolvedPerson> {
  const internal = isInternal(addr.email);
  try {
    const rows = rowsOf<{
      id: number;
      account_id: number | null;
      classification: string | null;
    }>(
      await db.execute(
        sql`select id, account_id, classification from people where lower(email) = ${addr.email} limit 1`,
      ),
    );
    const row = rows?.[0];
    if (row) {
      return {
        personId: row.id,
        accountId: row.account_id ?? null,
        classification: row.classification ?? (internal ? "internal" : "unknown"),
      };
    }
  } catch {
    // people table absent (cutover not applied): fall through to no-link.
    return { personId: null, accountId: null, classification: internal ? "internal" : "unknown" };
  }

  if (!opts.createIfMissing) {
    return { personId: null, accountId: null, classification: internal ? "internal" : "unknown" };
  }

  // Unknown sender: create a person flagged for review (internal senders are
  // trusted and not flagged). Account stays null until Jordan maps it.
  try {
    const fullName = addr.name || addr.email;
    const classification = internal ? "internal" : "unknown";
    const created = rowsOf<{ id: number }>(
      await db.execute(
        sql`insert into people (full_name, classification, email, needs_review)
            values (${fullName}, ${classification}, ${addr.email}, ${!internal})
            returning id`,
      ),
    );
    return { personId: created?.[0]?.id ?? null, accountId: null, classification };
  } catch {
    return { personId: null, accountId: null, classification: internal ? "internal" : "unknown" };
  }
}

export interface MappedParticipant extends Addr {
  role: "from" | "to" | "cc";
  personId: number | null;
  accountId: number | null;
}

export interface MappingResult {
  participants: MappedParticipant[];
  emailAccountId: number | null;
  emailPersonId: number | null; // the sender
  needsReview: boolean;
}

// Resolve the whole message: sender + recipients -> people/accounts, and pick the
// customer account the thread belongs to (the first external party with an
// account; for outbound that is a recipient, for inbound it is the sender).
export async function mapParticipants(
  db: DB,
  from: Addr | null,
  to: Addr[],
  cc: Addr[],
): Promise<MappingResult> {
  const participants: MappedParticipant[] = [];

  let emailPersonId: number | null = null;
  if (from) {
    const r = await resolvePerson(db, from, { createIfMissing: true });
    emailPersonId = r.personId;
    participants.push({ ...from, role: "from", personId: r.personId, accountId: r.accountId });
  }
  for (const a of to) {
    const r = await resolvePerson(db, a, { createIfMissing: false });
    participants.push({ ...a, role: "to", personId: r.personId, accountId: r.accountId });
  }
  for (const a of cc) {
    const r = await resolvePerson(db, a, { createIfMissing: false });
    participants.push({ ...a, role: "cc", personId: r.personId, accountId: r.accountId });
  }

  // Account = first external participant that resolved to an account.
  const external = participants.filter((p) => !isInternal(p.email));
  const emailAccountId =
    external.find((p) => p.accountId != null)?.accountId ??
    participants.find((p) => p.accountId != null)?.accountId ??
    null;

  return {
    participants,
    emailAccountId,
    emailPersonId,
    needsReview: emailAccountId == null,
  };
}
