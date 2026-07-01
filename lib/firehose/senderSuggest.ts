import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { people, accounts, emails } from "@/lib/db/schema";
import { isInternal } from "./map";
import { ensureFirehoseSchema } from "./schema";

// Account/contact suggestions for unmapped senders. Suggestion-only: when a
// sender's address is not yet linked to an account, look for other contacts on
// the SAME email domain that ARE mapped, and suggest their account.

export interface AccountSuggestion {
  accountId: number;
  name: string;
  slug: string;
}

function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export async function suggestAccountForEmail(email: string): Promise<AccountSuggestion | null> {
  if (!dbConfigured()) return null;
  const domain = domainOf(email);
  if (!domain || isInternal(email)) return null;
  try {
    const db = getDb();
    // Other contacts on this domain that already have an account.
    const rows = await db
      .select({ accountId: people.accountId })
      .from(people)
      .where(
        and(isNotNull(people.accountId), sql`lower(${people.email}) like ${"%@" + domain}`),
      );
    if (!rows.length) return null;
    // Most common account wins.
    const counts = new Map<number, number>();
    for (const r of rows) if (r.accountId != null) counts.set(r.accountId, (counts.get(r.accountId) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top == null) return null;
    const [acct] = await db
      .select({ id: accounts.id, name: accounts.name, slug: accounts.slug })
      .from(accounts)
      .where(eq(accounts.id, top))
      .limit(1);
    if (!acct) return null;
    return { accountId: acct.id, name: acct.name, slug: acct.slug };
  } catch {
    return null;
  }
}

// Link a sender address to an account: map (or create) the person, and backfill
// every unmapped email from that address so the whole history joins the account.
export async function linkSenderToAccount(
  address: string,
  accountId: number,
  name?: string | null,
): Promise<void> {
  await ensureFirehoseSchema();
  const db = getDb();
  const addr = address.toLowerCase();

  const existing = await db
    .select({ id: people.id })
    .from(people)
    .where(sql`lower(${people.email}) = ${addr}`)
    .limit(1);

  if (existing.length) {
    await db
      .update(people)
      .set({ accountId, classification: "customer", needsReview: false, updatedAt: new Date() })
      .where(eq(people.id, existing[0].id));
  } else {
    await db.insert(people).values({
      fullName: name?.trim() || address,
      classification: "customer",
      accountId,
      email: address,
      needsReview: false,
    });
  }

  // Backfill the sender's mail onto the account.
  await db
    .update(emails)
    .set({ accountId, needsReview: false })
    .where(sql`lower(${emails.fromEmail}) = ${addr}`);
}
