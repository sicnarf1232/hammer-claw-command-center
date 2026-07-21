import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { people as peopleT } from "@/lib/db/schema";
import { cutoverActive } from "@/lib/dbSource";

// Name/email contact matching for the compose To/Cc typeahead (dev-feedback
// #15, part 1). A simple ilike match on the people table, capped, reusing
// this app's existing people/roster store (lib/peopleDb.ts's DB-backed roster
// reads the same table) rather than inventing a second contact list.

export interface ContactMatch {
  name: string | null;
  email: string;
}

export async function searchContacts(q: string, limit = 8): Promise<ContactMatch[]> {
  const query = q.trim();
  if (!query || !dbConfigured() || !(await cutoverActive())) return [];
  const like = `%${query}%`;
  try {
    const rows = await getDb()
      .select({ name: peopleT.fullName, email: peopleT.email })
      .from(peopleT)
      .where(
        sql`${peopleT.email} is not null and (${peopleT.fullName} ilike ${like} or ${peopleT.email} ilike ${like})`,
      )
      .orderBy(peopleT.fullName)
      .limit(limit);
    const out: ContactMatch[] = [];
    for (const r of rows) {
      if (r.email) out.push({ name: r.name, email: r.email });
    }
    return out;
  } catch {
    return [];
  }
}

// Person match for the "delegate" picker (dev-feedback #20): a lighter-weight
// sibling of searchContacts above rather than a duplicate backend. Unlike the
// compose To/Cc typeahead this DOES need the numeric id (the delegate wire
// format, see lib/taskUpdate.ts), and email is optional here since a
// delegate may have no email on file yet, whereas searchContacts requires
// one (an email compose target with no address is useless).
export interface PersonMatch {
  id: number;
  name: string;
  email: string | null;
}

export async function searchPeople(q: string, limit = 8): Promise<PersonMatch[]> {
  if (!dbConfigured() || !(await cutoverActive())) return [];
  const query = q.trim();
  try {
    const rows = await getDb()
      .select({ id: peopleT.id, name: peopleT.fullName, email: peopleT.email })
      .from(peopleT)
      .where(query ? sql`(${peopleT.fullName} ilike ${`%${query}%`} or ${peopleT.email} ilike ${`%${query}%`})` : sql`true`)
      .orderBy(peopleT.fullName)
      .limit(limit);
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email }));
  } catch {
    return [];
  }
}

// All known person ids, for validating a "delegate" field write against real
// people (mirrors how /api/tasks/update already validates "account" against
// listAccounts()). Small enough to fetch in full rather than a per-id check.
export async function listAllPersonIds(): Promise<number[]> {
  if (!dbConfigured() || !(await cutoverActive())) return [];
  try {
    const rows = await getDb().select({ id: peopleT.id }).from(peopleT);
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}
