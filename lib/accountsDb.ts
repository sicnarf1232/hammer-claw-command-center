import { and, eq, inArray } from "drizzle-orm";
import {
  getDb,
  accounts as accountsT,
  people as peopleT,
} from "@/lib/db";
import { cutoverActive } from "@/lib/dbSource";
import { slugify } from "@/lib/vault/accounts";
import { sanitizeForFilename } from "@/lib/meetingFormat";
import type { Account, AccountContact } from "@/lib/vault/types";
import type { AccountEdit } from "@/lib/accountEdit";
import type { NewContact } from "@/lib/contactsWrite";

// DB-backed accounts (Phase 2 cutover). Same Account shape the vault parser
// produces, so every consumer of listAccounts() is source-agnostic. All writes
// stamp origin='app' + confirmed_by='jordan': an app-touched row is never
// updated or removed by a re-seed (lib/cutover/diff.ts protects non-seed rows).

const APP_EDIT = { origin: "app", confirmedBy: "jordan" } as const;

function conventionalPath(name: string): string {
  const fileBase = sanitizeForFilename(name) || name;
  return `300 Merit/Customers/${fileBase}.md`;
}

type AccountRow = typeof accountsT.$inferSelect;

function rowToAccount(row: AccountRow, contacts: AccountContact[]): Account {
  return {
    slug: row.slug,
    name: row.name,
    path: row.sourcePath ?? conventionalPath(row.name),
    workstream: row.workstream,
    type: row.type ?? undefined,
    region: row.region ?? undefined,
    stage: row.stage ?? undefined,
    status: row.status ?? undefined,
    accountNumber: row.accountNumber ?? undefined,
    overview: row.overview ?? undefined,
    situations: row.situations ?? [],
    contacts,
    links: row.links ?? [],
  };
}

// All accounts + their customer contacts from the DB, or null when the cutover
// has not been seeded (callers fall back to the vault parse).
export async function listAccountsFromDb(): Promise<Account[] | null> {
  if (!(await cutoverActive())) return null;
  const db = getDb();
  const [rows, contactRows] = await Promise.all([
    db.select().from(accountsT),
    db
      .select()
      .from(peopleT)
      .where(and(eq(peopleT.classification, "customer"))),
  ]);
  const contactsByAccount = new Map<number, AccountContact[]>();
  for (const p of contactRows) {
    if (p.accountId == null) continue;
    const list = contactsByAccount.get(p.accountId) ?? [];
    list.push({
      name: p.fullName,
      title: p.title ?? undefined,
      email: p.email ?? undefined,
      phone: p.phone ?? undefined,
    });
    contactsByAccount.set(p.accountId, list);
  }
  return rows
    .map((row) => {
      const contacts = (contactsByAccount.get(row.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return rowToAccount(row, contacts);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function accountBySourcePath(path: string): Promise<AccountRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(accountsT)
    .where(eq(accountsT.sourcePath, path))
    .limit(1);
  return row ?? null;
}

export async function dbSetAccountNumber(
  path: string,
  accountNumber: string,
): Promise<{ commitSha: string; path: string }> {
  const row = await accountBySourcePath(path);
  if (!row) throw new Error(`Account not found in DB: ${path}`);
  await getDb()
    .update(accountsT)
    .set({
      accountNumber: accountNumber.trim() || null,
      ...APP_EDIT,
      updatedAt: new Date(),
    })
    .where(eq(accountsT.id, row.id));
  return { commitSha: "", path };
}

export async function dbCreateAccount(
  name: string,
): Promise<{ path: string; slug: string; created: boolean }> {
  const clean = name.trim();
  const path = conventionalPath(clean);
  const slug = slugify(sanitizeForFilename(clean) || clean);
  const db = getDb();
  const [existing] = await db
    .select({ id: accountsT.id })
    .from(accountsT)
    .where(eq(accountsT.slug, slug))
    .limit(1);
  if (existing) return { path, slug, created: false };
  await db.insert(accountsT).values({
    name: clean,
    slug,
    type: "Customer",
    status: "Prospect",
    workstream: "merit",
    sourcePath: path, // where the export will render it
    ...APP_EDIT,
  });
  return { path, slug, created: true };
}

// Edit an account's fields, overview, and contact list. Contacts submitted in
// the edit are upserted; contacts previously on the account but absent from
// the submitted list are DETACHED (accountId cleared + needsReview) rather
// than deleted, because firehose emails may reference the person row.
export async function dbEditAccountNote(
  path: string,
  edit: AccountEdit,
): Promise<{ commitSha: string; path: string }> {
  const row = await accountBySourcePath(path);
  if (!row) throw new Error(`Account not found in DB: ${path}`);
  const db = getDb();
  const now = new Date();
  await db
    .update(accountsT)
    .set({
      type: edit.type?.trim() || null,
      region: edit.region?.trim() || null,
      stage: edit.stage?.trim() || null,
      status: edit.status?.trim() || null,
      accountNumber: edit.accountNumber?.trim() || null,
      overview: edit.overview.trim() || null,
      ...APP_EDIT,
      updatedAt: now,
    })
    .where(eq(accountsT.id, row.id));

  const current = await db
    .select()
    .from(peopleT)
    .where(and(eq(peopleT.accountId, row.id), eq(peopleT.classification, "customer")));
  const submittedNames = new Set(
    edit.contacts.map((c) => c.name.trim().toLowerCase()).filter(Boolean),
  );

  for (const c of edit.contacts) {
    const name = c.name.trim();
    if (!name) continue;
    const match = current.find(
      (p) => p.fullName.trim().toLowerCase() === name.toLowerCase(),
    );
    if (match) {
      await db
        .update(peopleT)
        .set({
          title: c.title?.trim() || null,
          email: c.email?.trim() || null,
          phone: c.phone?.trim() || null,
          ...APP_EDIT,
          updatedAt: now,
        })
        .where(eq(peopleT.id, match.id));
    } else {
      await db.insert(peopleT).values({
        fullName: name,
        classification: "customer",
        accountId: row.id,
        title: c.title?.trim() || null,
        email: c.email?.trim() || null,
        phone: c.phone?.trim() || null,
        ...APP_EDIT,
      });
    }
  }

  const removed = current.filter(
    (p) => !submittedNames.has(p.fullName.trim().toLowerCase()),
  );
  if (removed.length) {
    await db
      .update(peopleT)
      .set({ accountId: null, needsReview: true, ...APP_EDIT, updatedAt: now })
      .where(inArray(peopleT.id, removed.map((p) => p.id)));
  }

  return { commitSha: "", path };
}

export async function dbAddAccountContacts(
  path: string,
  contacts: NewContact[],
): Promise<{ commitSha: string; path: string; added: string[] }> {
  const row = await accountBySourcePath(path);
  if (!row) throw new Error(`Account not found in DB: ${path}`);
  const db = getDb();
  const current = await db
    .select({ fullName: peopleT.fullName })
    .from(peopleT)
    .where(eq(peopleT.accountId, row.id));
  const have = new Set(current.map((p) => p.fullName.trim().toLowerCase()));
  const added: string[] = [];
  for (const c of contacts) {
    const name = c.name.trim();
    if (!name || have.has(name.toLowerCase())) continue;
    await db.insert(peopleT).values({
      fullName: name,
      classification: "customer",
      accountId: row.id,
      title: c.title?.trim() || null,
      email: c.email?.trim() || null,
      sourcePaths: [path],
      ...APP_EDIT,
    });
    have.add(name.toLowerCase());
    added.push(name);
  }
  return { commitSha: "", path, added };
}

export { conventionalPath as accountConventionalPath };
