import { eq, inArray, sql } from "drizzle-orm";
import {
  getDb,
  dbConfigured,
  accounts as accountsT,
  people as peopleT,
  personAliases as personAliasesT,
  series as seriesT,
  meetings as meetingsT,
  meetingAttendees as meetingAttendeesT,
  tasks as tasksT,
} from "@/lib/db";
import { gatherAndReconcile } from "./seed";
import { ensureCutoverSchema } from "./schema";
import { planTable, planCounts, type PlanCounts, type ExistingRow } from "./diff";
import type { ReconcileReport } from "./reconcile";
import { normalizePersonName } from "@/lib/vault/people";

export interface ApplyResult {
  report: ReconcileReport;
  // Per-table diff counts: what this run actually did. `protected` counts
  // app/proposal rows the seed deliberately left alone.
  plan: Record<"accounts" | "people" | "series" | "meetings" | "tasks", PlanCounts>;
}

// Diff/upsert apply (Phase 2, replaces the Stage-1 wipe-and-reload): rows are
// matched by natural key; only origin='seed' rows are updated or removed, so
// tasks/accounts/meetings created in the app SURVIVE a re-seed, and unchanged
// rows keep their ids (firehose emails.account_id/person_id stay valid).
// Re-runnable: a second run against an unchanged vault is a no-op.
export async function applySeed(): Promise<ApplyResult> {
  if (!dbConfigured()) {
    throw new Error("POSTGRES_URL is not set.");
  }
  const db = getDb();
  await ensureCutoverSchema();
  const r = await gatherAndReconcile();
  const now = new Date();

  // ---- accounts (key: slug) ----
  const exAccounts = await db.select().from(accountsT);
  const accountsPlan = planTable(
    exAccounts.map((a): ExistingRow => ({
      id: a.id,
      key: a.slug,
      origin: a.origin,
      fields: {
        name: a.name, slug: a.slug, type: a.type, region: a.region,
        stage: a.stage, status: a.status, accountNumber: a.accountNumber,
        overview: a.overview, situations: a.situations, links: a.links,
        sourcePath: a.sourcePath, workstream: a.workstream,
      },
    })),
    r.accounts.map((a) => ({
      key: a.slug,
      fields: {
        name: a.name, slug: a.slug, type: a.type ?? null, region: a.region ?? null,
        stage: a.stage ?? null, status: a.status ?? null,
        accountNumber: a.accountNumber ?? null, overview: a.overview ?? null,
        situations: a.situations ?? null, links: a.links ?? null,
        sourcePath: a.sourcePath ?? null, workstream: "merit",
      },
    })),
  );
  const accountIdBySlug = new Map<string, number>();
  for (const a of exAccounts) accountIdBySlug.set(a.slug, a.id);
  if (accountsPlan.removeIds.length) {
    await db.delete(accountsT).where(inArray(accountsT.id, accountsPlan.removeIds));
    for (const [slug, id] of accountIdBySlug) {
      if (accountsPlan.removeIds.includes(id)) accountIdBySlug.delete(slug);
    }
  }
  for (const u of accountsPlan.update) {
    await db.update(accountsT)
      .set({ ...(u.fields as object), updatedAt: now })
      .where(eq(accountsT.id, u.id));
  }
  for (const ins of accountsPlan.insert) {
    const [row] = await db.insert(accountsT)
      .values({ ...(ins.fields as typeof accountsT.$inferInsert), origin: "seed" })
      .returning({ id: accountsT.id });
    accountIdBySlug.set(ins.key, row.id);
  }

  // ---- people (key: normalized full name) ----
  const exPeople = await db.select().from(peopleT);
  const peopleKey = (fullName: string) => normalizePersonName(fullName);
  const peoplePlan = planTable(
    exPeople.map((p): ExistingRow => ({
      id: p.id,
      key: peopleKey(p.fullName),
      origin: p.origin,
      fields: {
        fullName: p.fullName, classification: p.classification,
        accountId: p.accountId, title: p.title, email: p.email, phone: p.phone,
        isSelf: p.isSelf, needsReview: p.needsReview, sourcePaths: p.sourcePaths,
      },
    })),
    r.people.map((p) => ({
      key: peopleKey(p.fullName),
      fields: {
        fullName: p.fullName, classification: p.classification,
        accountId: p.accountSlug ? accountIdBySlug.get(p.accountSlug) ?? null : null,
        title: p.title ?? null, email: p.email ?? null, phone: p.phone ?? null,
        isSelf: p.isSelf, needsReview: p.needsReview, sourcePaths: p.sourcePaths,
      },
    })),
  );
  const personIdByNameKey = new Map<string, number>();
  for (const p of exPeople) personIdByNameKey.set(peopleKey(p.fullName), p.id);
  if (peoplePlan.removeIds.length) {
    await db.delete(personAliasesT)
      .where(inArray(personAliasesT.personId, peoplePlan.removeIds));
    await db.delete(peopleT).where(inArray(peopleT.id, peoplePlan.removeIds));
    for (const [k, id] of personIdByNameKey) {
      if (peoplePlan.removeIds.includes(id)) personIdByNameKey.delete(k);
    }
  }
  for (const u of peoplePlan.update) {
    await db.update(peopleT)
      .set({ ...(u.fields as object), updatedAt: now })
      .where(eq(peopleT.id, u.id));
  }
  for (const ins of peoplePlan.insert) {
    const [row] = await db.insert(peopleT)
      .values({ ...(ins.fields as typeof peopleT.$inferInsert), origin: "seed" })
      .returning({ id: peopleT.id });
    personIdByNameKey.set(ins.key, row.id);
  }
  // person key (reconcile's p1/p2/... run-scoped keys) -> DB id
  const personIdByKey = new Map<string, number>();
  for (const p of r.people) {
    const id = personIdByNameKey.get(peopleKey(p.fullName));
    if (id != null) personIdByKey.set(p.key, id);
  }
  // Aliases: rebuild for seed-origin people only (cheap, and aliases carry no
  // app-owned state). App-origin people keep whatever aliases they have.
  const seedPersonIds = exPeople
    .filter((p) => p.origin === "seed")
    .map((p) => p.id)
    .filter((id) => !peoplePlan.removeIds.includes(id));
  const insertedPersonIds = peoplePlan.insert
    .map((i) => personIdByNameKey.get(i.key))
    .filter((id): id is number => id != null);
  const rebuildAliasIds = [...seedPersonIds, ...insertedPersonIds];
  if (rebuildAliasIds.length) {
    await db.delete(personAliasesT)
      .where(inArray(personAliasesT.personId, rebuildAliasIds));
  }
  for (const p of r.people) {
    if (!p.aliases.length) continue;
    const id = personIdByNameKey.get(peopleKey(p.fullName));
    if (id == null || !rebuildAliasIds.includes(id)) continue;
    await db.insert(personAliasesT)
      .values(p.aliases.map((alias) => ({ personId: id, alias })))
      .onConflictDoNothing();
  }

  // ---- series (key: sourcePath, falling back to name) ----
  const exSeries = await db.select().from(seriesT);
  const seriesKeyOf = (sourcePath: string | null, name: string) =>
    sourcePath ?? `name:${name.toLowerCase()}`;
  const seriesPlan = planTable(
    exSeries.map((s): ExistingRow => ({
      id: s.id,
      key: seriesKeyOf(s.sourcePath, s.name),
      origin: s.origin,
      fields: {
        name: s.name, cadence: s.cadence, accountId: s.accountId,
        status: s.status, currentState: s.currentState, sourcePath: s.sourcePath,
      },
    })),
    r.series.map((s) => ({
      key: seriesKeyOf(s.sourcePath ?? null, s.name),
      fields: {
        name: s.name, cadence: s.cadence ?? null,
        accountId: s.accountSlug ? accountIdBySlug.get(s.accountSlug) ?? null : null,
        status: s.status, currentState: s.currentState ?? null,
        sourcePath: s.sourcePath ?? null,
      },
    })),
  );
  const seriesIdByName = new Map<string, number>();
  for (const s of exSeries) seriesIdByName.set(s.name, s.id);
  if (seriesPlan.removeIds.length) {
    await db.delete(seriesT).where(inArray(seriesT.id, seriesPlan.removeIds));
    for (const [name, id] of seriesIdByName) {
      if (seriesPlan.removeIds.includes(id)) seriesIdByName.delete(name);
    }
  }
  for (const u of seriesPlan.update) {
    await db.update(seriesT)
      .set({ ...(u.fields as object), updatedAt: now })
      .where(eq(seriesT.id, u.id));
  }
  for (const ins of seriesPlan.insert) {
    const [row] = await db.insert(seriesT)
      .values({ ...(ins.fields as typeof seriesT.$inferInsert), origin: "seed" })
      .returning({ id: seriesT.id, name: seriesT.name });
    seriesIdByName.set(row.name, row.id);
  }

  // ---- meetings (key: sourcePath, unique index) ----
  const exMeetings = await db.select().from(meetingsT);
  const meetingsPlan = planTable(
    exMeetings.map((m): ExistingRow => ({
      id: m.id,
      key: m.sourcePath ?? `id:${m.id}`,
      origin: m.origin,
      fields: {
        date: m.date, title: m.title, accountId: m.accountId,
        isInternal: m.isInternal, topic: m.topic, granolaId: m.granolaId,
        bodyMarkdown: m.bodyMarkdown, sections: m.sections, seriesId: m.seriesId,
        sourcePath: m.sourcePath,
      },
    })),
    r.meetings.map((m) => ({
      key: m.sourcePath,
      fields: {
        date: m.date ?? null, title: m.title,
        accountId: m.accountSlug ? accountIdBySlug.get(m.accountSlug) ?? null : null,
        isInternal: m.isInternal, topic: m.topic ?? null,
        granolaId: m.granolaId ?? null, bodyMarkdown: m.bodyMarkdown ?? null,
        sections: m.sections ?? null,
        seriesId: m.seriesName ? seriesIdByName.get(m.seriesName) ?? null : null,
        sourcePath: m.sourcePath,
      },
    })),
  );
  const meetingIdByPath = new Map<string, number>();
  for (const m of exMeetings) {
    if (m.sourcePath) meetingIdByPath.set(m.sourcePath, m.id);
  }
  if (meetingsPlan.removeIds.length) {
    await db.delete(meetingAttendeesT)
      .where(inArray(meetingAttendeesT.meetingId, meetingsPlan.removeIds));
    await db.delete(meetingsT).where(inArray(meetingsT.id, meetingsPlan.removeIds));
    for (const [path, id] of meetingIdByPath) {
      if (meetingsPlan.removeIds.includes(id)) meetingIdByPath.delete(path);
    }
  }
  for (const u of meetingsPlan.update) {
    await db.update(meetingsT)
      .set({ ...(u.fields as object), updatedAt: now })
      .where(eq(meetingsT.id, u.id));
  }
  for (const ins of meetingsPlan.insert) {
    const [row] = await db.insert(meetingsT)
      .values({ ...(ins.fields as typeof meetingsT.$inferInsert), origin: "seed" })
      .returning({ id: meetingsT.id });
    meetingIdByPath.set(ins.key, row.id);
  }
  // Attendees: rebuild for the seed meetings present in this reconcile.
  const seedMeetingIds = r.meetings
    .map((m) => meetingIdByPath.get(m.sourcePath))
    .filter((id): id is number => id != null);
  if (seedMeetingIds.length) {
    await db.delete(meetingAttendeesT)
      .where(inArray(meetingAttendeesT.meetingId, seedMeetingIds));
  }
  for (const m of r.meetings) {
    const meetingId = meetingIdByPath.get(m.sourcePath);
    if (meetingId == null) continue;
    const rows = m.attendeeKeys
      .map((k) => personIdByKey.get(k))
      .filter((id): id is number => id != null)
      .map((personId) => ({ meetingId, personId }));
    if (rows.length) {
      await db.insert(meetingAttendeesT).values(rows).onConflictDoNothing();
    }
  }

  // ---- tasks (key: sourcePath:sourceLine) ----
  const exTasks = await db.select().from(tasksT);
  const tasksPlan = planTable(
    exTasks.map((t): ExistingRow => ({
      id: t.id,
      key: `${t.sourcePath}:${t.sourceLine}`,
      origin: t.origin,
      fields: {
        meetingId: t.meetingId, ownerPersonId: t.ownerPersonId,
        accountId: t.accountId, text: t.text, done: t.done, due: t.due,
        priority: t.priority, status: t.status, isJordans: t.isJordans,
        description: t.description, notes: t.notes, workstream: t.workstream,
        customer: t.customer, createdField: t.createdField,
        scheduled: t.scheduled, thread: t.thread, completed: t.completed,
        fields: t.fields, sourcePath: t.sourcePath, sourceLine: t.sourceLine,
      },
    })),
    r.tasks.map((t) => ({
      key: `${t.sourcePath}:${t.sourceLine}`,
      fields: {
        meetingId: meetingIdByPath.get(t.sourcePath) ?? null,
        ownerPersonId: t.ownerKey ? personIdByKey.get(t.ownerKey) ?? null : null,
        accountId: t.accountSlug ? accountIdBySlug.get(t.accountSlug) ?? null : null,
        text: t.text, done: t.done, due: t.due ?? null,
        priority: t.priority ?? null, status: t.status ?? null,
        isJordans: t.isJordans, description: t.description ?? null,
        notes: t.notes ?? null, workstream: t.workstream ?? null,
        customer: t.customer ?? null, createdField: t.created ?? null,
        scheduled: t.scheduled ?? null, thread: t.thread ?? null,
        completed: t.completed ?? null, fields: t.fields ?? null,
        sourcePath: t.sourcePath, sourceLine: t.sourceLine,
      },
    })),
  );
  if (tasksPlan.removeIds.length) {
    await db.delete(tasksT).where(inArray(tasksT.id, tasksPlan.removeIds));
  }
  for (const u of tasksPlan.update) {
    await db.update(tasksT)
      .set({ ...(u.fields as object), updatedAt: now })
      .where(eq(tasksT.id, u.id));
  }
  // Bulk-insert tasks in chunks (hundreds of rows on first run).
  const taskInserts = tasksPlan.insert.map(
    (ins) => ({ ...(ins.fields as typeof tasksT.$inferInsert), origin: "seed" }),
  );
  for (let i = 0; i < taskInserts.length; i += 200) {
    await db.insert(tasksT).values(taskInserts.slice(i, i + 200));
  }

  // Cheap sanity stamp for debugging seed history.
  await db.execute(sql`
    insert into app_meta (key, value, updated_at)
    values ('cutover_last_apply', ${new Date().toISOString()}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `);

  return {
    report: r.report,
    plan: {
      accounts: planCounts(accountsPlan),
      people: planCounts(peoplePlan),
      series: planCounts(seriesPlan),
      meetings: planCounts(meetingsPlan),
      tasks: planCounts(tasksPlan),
    },
  };
}
