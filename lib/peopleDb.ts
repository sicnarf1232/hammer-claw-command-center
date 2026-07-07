import { and, eq, or, sql } from "drizzle-orm";
import {
  getDb,
  accounts as accountsT,
  people as peopleT,
  personAliases as aliasesT,
} from "@/lib/db";
import { cutoverActive } from "@/lib/dbSource";
import type { Roster, RosterEntry } from "@/lib/vault/types";

// DB-backed people/roster (Phase 2 cutover). The Roster map shape the vault
// parser produces is preserved so classifyName and every consumer stay
// source-agnostic: entries are keyed by full name AND each alias.

const APP_EDIT = { origin: "app", confirmedBy: "jordan" } as const;

export async function rosterFromDb(): Promise<Roster | null> {
  if (!(await cutoverActive())) return null;
  const db = getDb();
  const [rows, aliasRows, accountRows] = await Promise.all([
    db.select().from(peopleT),
    db.select().from(aliasesT),
    db.select({ id: accountsT.id, name: accountsT.name }).from(accountsT),
  ]);
  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));
  const aliasesByPerson = new Map<number, string[]>();
  for (const a of aliasRows) {
    const list = aliasesByPerson.get(a.personId) ?? [];
    list.push(a.alias);
    aliasesByPerson.set(a.personId, list);
  }

  const roster: Roster = new Map();
  for (const p of rows) {
    if (p.classification !== "internal" && p.classification !== "customer") {
      continue; // unknowns are not roster entries, same as the vault roster
    }
    const entry: RosterEntry = {
      name: p.fullName,
      classification: p.classification === "internal" ? "merit" : "customer",
      account:
        p.accountId != null ? accountName.get(p.accountId) ?? undefined : undefined,
    };
    roster.set(p.fullName.trim(), entry);
    for (const alias of aliasesByPerson.get(p.id) ?? []) {
      const key = alias.trim();
      if (key && !roster.has(key)) roster.set(key, entry);
    }
  }
  return roster;
}

async function findPersonByName(name: string) {
  const db = getDb();
  const clean = name.trim();
  const [byName] = await db
    .select()
    .from(peopleT)
    .where(sql`lower(${peopleT.fullName}) = ${clean.toLowerCase()}`)
    .limit(1);
  if (byName) return byName;
  const [aliasHit] = await db
    .select({ personId: aliasesT.personId })
    .from(aliasesT)
    .where(sql`lower(${aliasesT.alias}) = ${clean.toLowerCase()}`)
    .limit(1);
  if (!aliasHit) return null;
  const [p] = await db
    .select()
    .from(peopleT)
    .where(eq(peopleT.id, aliasHit.personId))
    .limit(1);
  return p ?? null;
}

// Set a person's authoritative classification (and account for customers) in
// the DB. Creates the person when unknown. Mirrors the roster-override writer.
export async function dbSetPersonClassification(
  name: string,
  classification: "merit" | "customer",
  account: string | null,
): Promise<{ commitSha: string }> {
  const db = getDb();
  const clean = name.trim();
  let accountId: number | null = null;
  if (classification === "customer" && account) {
    const [acc] = await db
      .select({ id: accountsT.id })
      .from(accountsT)
      .where(
        or(
          sql`lower(${accountsT.name}) = ${account.trim().toLowerCase()}`,
          eq(accountsT.slug, account.trim().toLowerCase()),
        ),
      )
      .limit(1);
    accountId = acc?.id ?? null;
  }
  const values = {
    classification: classification === "merit" ? "internal" : "customer",
    accountId: classification === "customer" ? accountId : null,
    needsReview: false,
    ...APP_EDIT,
    updatedAt: new Date(),
  };
  const existing = await findPersonByName(clean);
  if (existing) {
    await db.update(peopleT).set(values).where(eq(peopleT.id, existing.id));
  } else {
    await db.insert(peopleT).values({ fullName: clean, ...values });
  }
  return { commitSha: "" };
}

export interface ReviewPerson {
  id: number;
  fullName: string;
  classification: string;
  accountName: string | null;
  email: string | null;
  title: string | null;
  sourcePaths: string[];
}

// The who-is-who confirm queue (DB-CUTOVER stage 3): people the seed or the
// firehose flagged as ambiguous/unmapped.
export async function listNeedsReviewPeople(): Promise<ReviewPerson[]> {
  if (!(await cutoverActive())) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: peopleT.id,
      fullName: peopleT.fullName,
      classification: peopleT.classification,
      email: peopleT.email,
      title: peopleT.title,
      sourcePaths: peopleT.sourcePaths,
      accountName: accountsT.name,
    })
    .from(peopleT)
    .leftJoin(accountsT, eq(peopleT.accountId, accountsT.id))
    .where(and(eq(peopleT.needsReview, true)))
    .orderBy(peopleT.fullName)
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    classification: r.classification,
    accountName: r.accountName ?? null,
    email: r.email,
    title: r.title,
    sourcePaths: r.sourcePaths ?? [],
  }));
}

// Resolve one review-queue entry: classify (internal / customer+account) or
// just dismiss the flag.
export async function resolveReviewPerson(
  id: number,
  action:
    | { kind: "dismiss" }
    | { kind: "classify"; classification: "internal" | "customer"; accountId: number | null },
): Promise<void> {
  const db = getDb();
  if (action.kind === "dismiss") {
    await db
      .update(peopleT)
      .set({ needsReview: false, ...APP_EDIT, updatedAt: new Date() })
      .where(eq(peopleT.id, id));
    return;
  }
  await db
    .update(peopleT)
    .set({
      classification: action.classification,
      accountId: action.classification === "customer" ? action.accountId : null,
      needsReview: false,
      ...APP_EDIT,
      updatedAt: new Date(),
    })
    .where(eq(peopleT.id, id));
}
