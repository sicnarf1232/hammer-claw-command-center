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
import type { ReconcileReport } from "./reconcile";

// Stage 1 apply: write the reconciled vault into the app DB. Idempotent — wipes
// the cutover tables and reloads them from a fresh reconcile, so it can be re-run
// safely while seeding. Only touches the cutover tables (nothing reads them yet;
// dual-read is Stage 2). Gated on POSTGRES_URL + an explicit confirm in the route.
export async function applySeed(): Promise<ReconcileReport> {
  if (!dbConfigured()) {
    throw new Error("POSTGRES_URL is not set; run `npm run db:push` first.");
  }
  const db = getDb();
  const r = await gatherAndReconcile();

  // Wipe children -> parents.
  await db.delete(tasksT);
  await db.delete(meetingAttendeesT);
  await db.delete(meetingsT);
  await db.delete(personAliasesT);
  await db.delete(peopleT);
  await db.delete(seriesT);
  await db.delete(accountsT);

  const accountIdBySlug = new Map<string, number>();
  for (const a of r.accounts) {
    const [row] = await db
      .insert(accountsT)
      .values({
        name: a.name,
        slug: a.slug,
        type: a.type,
        region: a.region,
        stage: a.stage,
        status: a.status,
        accountNumber: a.accountNumber,
        overview: a.overview,
        sourcePath: a.sourcePath,
      })
      .returning({ id: accountsT.id });
    accountIdBySlug.set(a.slug, row.id);
  }

  const personIdByKey = new Map<string, number>();
  for (const p of r.people) {
    const [row] = await db
      .insert(peopleT)
      .values({
        fullName: p.fullName,
        classification: p.classification,
        accountId: p.accountSlug ? accountIdBySlug.get(p.accountSlug) ?? null : null,
        title: p.title,
        email: p.email,
        phone: p.phone,
        isSelf: p.isSelf,
        needsReview: p.needsReview,
        sourcePaths: p.sourcePaths,
      })
      .returning({ id: peopleT.id });
    personIdByKey.set(p.key, row.id);
    if (p.aliases.length) {
      await db
        .insert(personAliasesT)
        .values(p.aliases.map((alias) => ({ personId: row.id, alias })))
        .onConflictDoNothing();
    }
  }

  const seriesIdByName = new Map<string, number>();
  for (const s of r.series) {
    const [row] = await db
      .insert(seriesT)
      .values({
        name: s.name,
        cadence: s.cadence,
        accountId: s.accountSlug ? accountIdBySlug.get(s.accountSlug) ?? null : null,
        status: s.status,
        currentState: s.currentState,
        sourcePath: s.sourcePath,
      })
      .returning({ id: seriesT.id });
    seriesIdByName.set(s.name, row.id);
  }

  for (const m of r.meetings) {
    const [row] = await db
      .insert(meetingsT)
      .values({
        date: m.date,
        title: m.title,
        accountId: m.accountSlug ? accountIdBySlug.get(m.accountSlug) ?? null : null,
        isInternal: m.isInternal,
        topic: m.topic,
        granolaId: m.granolaId,
        bodyMarkdown: m.bodyMarkdown,
        sections: m.sections,
        seriesId: m.seriesName ? seriesIdByName.get(m.seriesName) ?? null : null,
        sourcePath: m.sourcePath,
      })
      .returning({ id: meetingsT.id });
    const attendeeRows = m.attendeeKeys
      .map((k) => personIdByKey.get(k))
      .filter((id): id is number => id != null)
      .map((personId) => ({ meetingId: row.id, personId }));
    if (attendeeRows.length) {
      await db.insert(meetingAttendeesT).values(attendeeRows).onConflictDoNothing();
    }
    // Resolve this meeting's tasks now that we have its id.
    const its = r.tasks.filter((t) => t.sourcePath === m.sourcePath);
    if (its.length) {
      await db.insert(tasksT).values(
        its.map((t) => ({
          meetingId: row.id,
          ownerPersonId: t.ownerKey ? personIdByKey.get(t.ownerKey) ?? null : null,
          accountId: t.accountSlug ? accountIdBySlug.get(t.accountSlug) ?? null : null,
          text: t.text,
          done: t.done,
          due: t.due,
          priority: t.priority,
          status: t.status,
          isJordans: t.isJordans,
          description: t.description,
          notes: t.notes,
          sourcePath: t.sourcePath,
          sourceLine: t.sourceLine,
        })),
      );
    }
  }

  return r.report;
}
