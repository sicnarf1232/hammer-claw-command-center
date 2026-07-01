import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { accounts, people } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only: how many DB accounts/people exist, and a sample. Tells us if the
// cutover seed ran (the sender-link picker reads the DB accounts table).
export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  try {
  const db = getDb();
  const [acctCount] = await db.select({ n: sql<number>`count(*)::int` }).from(accounts);
  const [peopleCount] = await db.select({ n: sql<number>`count(*)::int` }).from(people);
  const [mappedPeople] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(people)
    .where(sql`${people.accountId} is not null`);
  const sample = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .orderBy(accounts.name)
    .limit(15);
  const stryker = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(sql`lower(${accounts.name}) like '%stryker%'`);
  return NextResponse.json({
    ok: true,
    accounts: acctCount?.n ?? 0,
    people: peopleCount?.n ?? 0,
    peopleMappedToAccount: mappedPeople?.n ?? 0,
    sample,
    strykerMatches: stryker,
  });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
