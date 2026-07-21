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
