import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
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

// dev-feedback #17: correct a person's display name by email, with no
// account/classification required. This is the ONLY write path for
// people.fullName that doesn't go through account-contact creation, meant
// for fixing a raw mailbox alias (e.g. "Mvanega3") an unmapped external
// sender surfaced as their name. Upserts by lowercased email: updates the
// existing row's fullName if one matches, otherwise inserts a fresh
// "unknown"-classification row so classification/account stay editable
// separately via PersonClassifier. personCardsForEmails matches on this same
// email column, so every thread view picks the corrected name up on next
// load with no change to any stored emails row.
export async function dbSetPersonName(
  email: string,
  fullName: string,
): Promise<{ id: number }> {
  const db = getDb();
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim();
  const [existing] = await db
    .select({ id: peopleT.id })
    .from(peopleT)
    .where(sql`lower(${peopleT.email}) = ${cleanEmail}`)
    .limit(1);
  if (existing) {
    await db
      .update(peopleT)
      .set({ fullName: cleanName, ...APP_EDIT, updatedAt: new Date() })
      .where(eq(peopleT.id, existing.id));
    return { id: existing.id };
  }
  const [inserted] = await db
    .insert(peopleT)
    .values({
      fullName: cleanName,
      email: cleanEmail,
      classification: "unknown",
      ...APP_EDIT,
    })
    .returning({ id: peopleT.id });
  return { id: inserted.id };
}

// People with ids/aliases/emails for the deterministic meeting-action owner
// resolver (Slice C, lib/meetingActionResolve.ts). Loaded once per pull.
// Unknown-classification rows are included: the resolver treats candidates as
// review material, and an unknown person can still be the right owner.
export interface ResolvePersonRow {
  id: number;
  fullName: string;
  classification: string;
  accountId: number | null;
  email: string | null;
  aliases: string[];
  isSelf: boolean;
}

// Pure mapper: ACTIVE people only. A superseded identity (superseded_by set)
// was merged into another person; it must never create false ambiguity, appear
// as a candidate, or be selectable in the review dropdown — the linking rules
// key on "only one ACTIVE person matches". Its aliases drop with it (they
// belong to the merge target after a proper Slice E merge).
export function activeResolvePeople(
  peopleRows: Array<{
    id: number;
    fullName: string;
    classification: string;
    accountId: number | null;
    email: string | null;
    isSelf: boolean | null;
    supersededBy: number | null;
  }>,
  aliasRows: Array<{ personId: number; alias: string }>,
): ResolvePersonRow[] {
  const active = peopleRows.filter((p) => p.supersededBy == null);
  const activeIds = new Set(active.map((p) => p.id));
  const aliasesByPerson = new Map<number, string[]>();
  for (const a of aliasRows) {
    if (!activeIds.has(a.personId)) continue;
    const list = aliasesByPerson.get(a.personId) ?? [];
    list.push(a.alias);
    aliasesByPerson.set(a.personId, list);
  }
  return active.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    classification: p.classification,
    accountId: p.accountId ?? null,
    email: p.email ?? null,
    aliases: aliasesByPerson.get(p.id) ?? [],
    isSelf: p.isSelf ?? false,
  }));
}

export async function listPeopleForResolve(): Promise<ResolvePersonRow[]> {
  if (!(await cutoverActive())) return [];
  const db = getDb();
  const [rows, aliasRows] = await Promise.all([
    db.select().from(peopleT),
    db.select().from(aliasesT),
  ]);
  return activeResolvePeople(rows, aliasRows);
}

// Where-predicate for "these person ids, ACTIVE people only". Uses Drizzle's
// inArray (rendered as `id IN ($1, $2, ...)`) instead of a raw `= any(${ids})`
// binding: the neon HTTP driver does not pass a JS array as a Postgres array
// param through the query builder, which failed in production with
// "op ANY/ALL (array) requires array on right side". Extracted so the
// generated SQL is testable without a database. Callers must guard ids.length
// (Drizzle's inArray rejects an empty list).
export function activePersonIdsPredicate(ids: number[]) {
  return and(inArray(peopleT.id, ids), isNull(peopleT.supersededBy));
}

// Active person ids for server-side review validation: a confirmed owner must
// exist and must not be a superseded identity. Validation semantics unchanged
// by the hotfix; only the predicate rendering moved to inArray.
export async function activePersonIdSet(ids: number[]): Promise<Set<number>> {
  if (!ids.length || !(await cutoverActive())) return new Set();
  const rows = await getDb()
    .select({ id: peopleT.id })
    .from(peopleT)
    .where(activePersonIdsPredicate(ids));
  return new Set(rows.map((r) => r.id));
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

// Contact-card data for a set of email addresses (thread views). Best-effort:
// unknown addresses simply return no card.
export interface PersonCard {
  email: string;
  fullName: string | null;
  title: string | null;
  phone: string | null;
  accountName: string | null;
  classification: string | null;
}

export async function personCardsForEmails(
  emails: string[],
): Promise<Map<string, PersonCard>> {
  const out = new Map<string, PersonCard>();
  const unique = Array.from(new Set(emails.map((e) => e.toLowerCase()))).filter(Boolean);
  if (!unique.length || !(await cutoverActive())) return out;
  try {
    const rows = await getDb()
      .select({
        email: peopleT.email,
        fullName: peopleT.fullName,
        title: peopleT.title,
        phone: peopleT.phone,
        classification: peopleT.classification,
        accountName: accountsT.name,
      })
      .from(peopleT)
      .leftJoin(accountsT, eq(peopleT.accountId, accountsT.id))
      .where(sql`lower(${peopleT.email}) = any(${unique})`);
    for (const r of rows) {
      if (!r.email) continue;
      out.set(r.email.toLowerCase(), {
        email: r.email.toLowerCase(),
        fullName: r.fullName,
        title: r.title,
        phone: r.phone,
        accountName: r.accountName ?? null,
        classification: r.classification,
      });
    }
    // Second pass: resolve addresses with no people-row email match by NAME
    // heuristics against the people table, so "mblackham@merit.com" shows as
    // Michael Blackham. Two patterns: first.last and <initial><lastname>.
    const unmatched = unique.filter((e) => !out.has(e));
    if (unmatched.length) {
      const all = await getDb()
        .select({
          fullName: peopleT.fullName,
          title: peopleT.title,
          phone: peopleT.phone,
          classification: peopleT.classification,
          accountName: accountsT.name,
        })
        .from(peopleT)
        .leftJoin(accountsT, eq(peopleT.accountId, accountsT.id));
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
      for (const email of unmatched) {
        const local = email.split("@")[0] ?? "";
        const parts = local.split(/[._-]+/).filter(Boolean);
        let hit: (typeof all)[number] | undefined;
        if (parts.length >= 2) {
          // first.last: both tokens appear in the full name.
          hit = all.find((p) => {
            const n = norm(p.fullName);
            return n.startsWith(norm(parts[0])) && n.endsWith(norm(parts[parts.length - 1]));
          });
        } else if (parts.length === 1 && parts[0].length > 3) {
          // <initial><lastname>: mblackham -> M... Blackham. Require a unique match.
          const initial = parts[0][0];
          const last = norm(parts[0].slice(1));
          const candidates = all.filter((p) => {
            const words = p.fullName.trim().toLowerCase().split(/\s+/);
            return (
              words.length >= 2 &&
              words[0].startsWith(initial) &&
              norm(words[words.length - 1]) === last
            );
          });
          if (candidates.length === 1) hit = candidates[0];
        }
        if (hit) {
          out.set(email, {
            email,
            fullName: hit.fullName,
            title: hit.title,
            phone: hit.phone,
            accountName: hit.accountName ?? null,
            classification: hit.classification,
          });
        }
      }
    }
  } catch {
    // people table absent pre-seed
  }
  return out;
}
