import { eq, inArray, isNull, sql } from "drizzle-orm";
import {
  getDb,
  accounts as accountsT,
  meetings as meetingsT,
  series as seriesT,
  tasks as tasksT,
} from "@/lib/db";
import { cutoverActive } from "@/lib/dbSource";
import { planMeetingTaskSync, reconcileBlocker, ARCHIVED_STATUS } from "@/lib/meetingTaskSync";
import type { MeetingActionProposal } from "@/lib/proposals/types";
import { parseMeetingNote } from "@/lib/vault/meetings";
import { parseSeriesDoc, type Series } from "@/lib/vault/series";
import { indexRowFromPath } from "@/lib/meetingFormat";
import type { MeetingNote } from "@/lib/vault/types";

// DB-backed meetings + rolling series (Phase 2 cutover). The row stores the
// FULL markdown content; the same parsers that read vault files run against
// it, so fidelity is identical. Structured columns (date, account_id, ...)
// exist for queries; the content is canonical for rendering and export.
//
// Rows without body_markdown mean the seed predates the content-in-DB change;
// the readers then return null and callers fall back to the vault until the
// next re-seed fills the content in.

const APP_EDIT = { origin: "app", confirmedBy: "jordan" } as const;

async function contentReady(): Promise<boolean> {
  if (!(await cutoverActive())) return false;
  const db = getDb();
  const [meetingsMissing] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(meetingsT)
    .where(isNull(meetingsT.bodyMarkdown))) as Array<{ n: number }>;
  return (meetingsMissing?.n ?? 0) === 0;
}

export async function meetingNotesFromDb(): Promise<MeetingNote[] | null> {
  if (!(await contentReady())) return null;
  const rows = await getDb().select().from(meetingsT);
  return rows
    .filter((r) => r.bodyMarkdown && r.sourcePath)
    .map((r) => parseMeetingNote(r.bodyMarkdown!, r.sourcePath!))
    .sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));
}

export async function meetingNoteByPathFromDb(
  path: string,
): Promise<MeetingNote | null> {
  if (!(await cutoverActive())) return null;
  const [row] = await getDb()
    .select()
    .from(meetingsT)
    .where(eq(meetingsT.sourcePath, path))
    .limit(1);
  if (!row?.bodyMarkdown) return null;
  return parseMeetingNote(row.bodyMarkdown, path);
}

// Delete a series row and unlink its meetings (their notes stay; only the
// rolling doc and the linkage go). DB-only; the vault copy, if any, is
// untouched and disappears from exports naturally.
export async function dbDeleteSeries(
  path: string,
): Promise<{ deleted: boolean; unlinked: number }> {
  if (!(await cutoverActive())) {
    throw new Error("Series deletion requires the app database.");
  }
  const db = getDb();
  const [row] = await db
    .select({ id: seriesT.id })
    .from(seriesT)
    .where(eq(seriesT.sourcePath, path))
    .limit(1);
  if (!row) return { deleted: false, unlinked: 0 };
  const unlinked = await db
    .update(meetingsT)
    .set({ seriesId: null, updatedAt: new Date() })
    .where(eq(meetingsT.seriesId, row.id))
    .returning({ id: meetingsT.id });
  await db.delete(seriesT).where(eq(seriesT.id, row.id));
  return { deleted: true, unlinked: unlinked.length };
}

// Date + title for a set of meeting paths, for folding selected past
// meetings into a manually created series.
export async function meetingHeadersByPaths(
  paths: string[],
): Promise<Array<{ sourcePath: string; date: string | null; title: string }>> {
  if (!paths.length || !(await cutoverActive())) return [];
  const rows = await getDb()
    .select({
      sourcePath: meetingsT.sourcePath,
      date: meetingsT.date,
      title: meetingsT.title,
    })
    .from(meetingsT)
    .where(inArray(meetingsT.sourcePath, paths));
  return rows
    .filter((r): r is typeof r & { sourcePath: string } => !!r.sourcePath)
    .map((r) => ({ sourcePath: r.sourcePath, date: r.date, title: r.title }));
}

export async function meetingPathsFromDb(): Promise<string[] | null> {
  if (!(await cutoverActive())) return null;
  const rows = await getDb()
    .select({ sourcePath: meetingsT.sourcePath })
    .from(meetingsT);
  return rows.map((r) => r.sourcePath).filter((p): p is string => !!p);
}

export interface IndexRowLike {
  date: string;
  bucket: string;
  title: string;
  noteBasename: string;
  notePath: string | null;
}

// The DB IS the meetings index once seeded: derive the index rows from source
// paths, newest first.
export async function meetingsIndexFromDb(): Promise<IndexRowLike[] | null> {
  const paths = await meetingPathsFromDb();
  if (!paths) return null;
  const out: IndexRowLike[] = [];
  for (const p of paths) {
    const row = indexRowFromPath(p);
    if (!row) continue;
    out.push({
      date: row.date,
      bucket: row.bucket,
      title: row.title,
      noteBasename: row.basename,
      notePath: p,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function seriesListFromDb(): Promise<Series[] | null> {
  if (!(await cutoverActive())) return null;
  const rows = await getDb().select().from(seriesT);
  const withContent = rows.filter((r) => r.bodyMarkdown && r.sourcePath);
  // Series predating content-in-DB: fall back entirely rather than show a
  // partial list.
  if (rows.length && withContent.length !== rows.length) return null;
  return withContent
    .map((r) => parseSeriesDoc(r.bodyMarkdown!, r.sourcePath!))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
}

export async function seriesByPathFromDb(path: string): Promise<Series | null> {
  if (!(await cutoverActive())) return null;
  const [row] = await getDb()
    .select()
    .from(seriesT)
    .where(eq(seriesT.sourcePath, path))
    .limit(1);
  if (!row?.bodyMarkdown) return null;
  return parseSeriesDoc(row.bodyMarkdown, path);
}

// ---- writers (origin='app' / 'proposal'; source_path is the stable identity
// and never changes here; the export computes canonical placement) ----

async function accountIdByName(name: string | null): Promise<number | null> {
  if (!name) return null;
  const [row] = await getDb()
    .select({ id: accountsT.id })
    .from(accountsT)
    .where(sql`lower(${accountsT.name}) = ${name.trim().toLowerCase()}`)
    .limit(1);
  return row?.id ?? null;
}

// Re-derive the structured columns from (possibly edited) content and save.
// `structured` rides along on the proposal-approval path (Slice D): the
// reviewed action contract plus the granola id used as the identity namespace.
// Without it (editor/manual paths) identity still holds: existing rows' own
// action ids are carried by fingerprint, so reorders no longer corrupt tasks.
export async function dbSaveMeetingContent(
  path: string,
  content: string,
  origin: "app" | "proposal" = "app",
  structured?: {
    actions: MeetingActionProposal[] | null;
    granolaId: string | null;
  },
): Promise<{ commitSha: string; path: string }> {
  const db = getDb();
  const note = parseMeetingNote(content, path);
  const accountId = await accountIdByName(note.customer?.display ?? note.customer?.basename ?? null);
  const values = {
    date: note.date ?? null,
    title: note.title,
    accountId,
    isInternal: !note.customer,
    topic: note.topic ?? null,
    granolaId: note.granolaId ?? null,
    bodyMarkdown: content,
    sections: note.sections,
    origin,
    confirmedBy: "jordan",
    updatedAt: new Date(),
  };
  const [existing] = await db
    .select({ id: meetingsT.id })
    .from(meetingsT)
    .where(eq(meetingsT.sourcePath, path))
    .limit(1);
  if (existing) {
    await db.update(meetingsT).set(values).where(eq(meetingsT.id, existing.id));
  } else {
    await db.insert(meetingsT).values({ ...values, sourcePath: path });
  }

  // Keep this meeting's task rows in step with its action items, reconciled
  // by STABLE ACTION ID (Slice D), not source line. The pure planner decides
  // updates/inserts/archives; removed actions are archived (status only),
  // never deleted (task ids are referenced by task_meta / task_emails).
  const meetingId =
    existing?.id ??
    (await db
      .select({ id: meetingsT.id })
      .from(meetingsT)
      .where(eq(meetingsT.sourcePath, path))
      .limit(1)
      .then((r) => r[0]?.id));
  if (meetingId != null) {
    await syncMeetingTasks({
      path,
      note,
      meetingId,
      accountId,
      origin,
      structured: structured ?? null,
    });
  }

  return { commitSha: "", path };
}

// Shared task-sync applier: plans against the given note content and applies
// updates/inserts/archives/reactivations. Used by dbSaveMeetingContent (new or
// edited content) and by dbReconcileMeetingActions (existing content preserved,
// reviewed links applied).
async function syncMeetingTasks(args: {
  path: string;
  note: MeetingNote;
  meetingId: number;
  accountId: number | null;
  origin: "app" | "proposal";
  structured: { actions: MeetingActionProposal[] | null; granolaId: string | null } | null;
}): Promise<void> {
  const db = getDb();
  const { path, note, meetingId, accountId, origin, structured } = args;
  const taskRows = await db
    .select({
      id: tasksT.id,
      actionId: tasksT.actionId,
      sourceLine: tasksT.sourceLine,
      text: tasksT.text,
      status: tasksT.status,
    })
    .from(tasksT)
    .where(eq(tasksT.sourcePath, path));

  const plan = planMeetingTaskSync({
    namespace: structured?.granolaId ?? note.granolaId ?? path,
    contractActions: structured?.actions ?? null,
    mdItems: note.actionItems.map((ai) => ({
      text: ai.text,
      owner: ai.owner ?? null,
      done: ai.done,
      due: ai.due ?? null,
      isJordans: ai.isJordans,
      sourceLine: ai.sourceLine,
      priority: ai.task?.priority ?? null,
    })),
    existingRows: taskRows,
  });

  for (const u of plan.updates) {
    await db
      .update(tasksT)
      .set({
        text: u.text,
        done: u.done,
        due: u.due,
        isJordans: u.isJordans,
        meetingId,
        accountId,
        actionId: u.actionId,
        sourceLine: u.sourceLine,
        // undefined = preserve the existing owner link (manual links survive
        // reprocessing); a number = confirmed link; null = explicit clear.
        ...(u.ownerPersonId !== undefined ? { ownerPersonId: u.ownerPersonId } : {}),
        // An archived row reclaimed by a live action returns to active views.
        // Only reactivations touch status; normal rows keep their workflow
        // status ("Waiting", ...) untouched.
        ...(u.reactivate ? { status: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tasksT.id, u.taskId));
  }
  for (const ins of plan.inserts) {
    await db.insert(tasksT).values({
      text: ins.text,
      done: ins.done,
      due: ins.due,
      isJordans: ins.isJordans,
      meetingId,
      accountId,
      actionId: ins.actionId,
      sourcePath: path,
      sourceLine: ins.sourceLine,
      ownerPersonId: ins.ownerPersonId,
      priority: ins.priority,
      customer: note.customer?.display ?? null,
      origin,
      confirmedBy: "jordan",
      updatedAt: new Date(),
    });
  }
  if (plan.archiveTaskIds.length) {
    await db
      .update(tasksT)
      .set({ status: ARCHIVED_STATUS, ...APP_EDIT, updatedAt: new Date() })
      .where(inArray(tasksT.id, plan.archiveTaskIds));
  }
}

// Approval found the meeting ALREADY in the DB (Codex D-review blocker 2):
// the stored content is preserved (never overwritten with the stale staged
// copy), but Jordan's reviewed action links still land, reconciled against
// the CURRENT stored content. Throws when reconciliation is impossible, so
// the approval fails loudly instead of succeeding while dropping links.
export async function dbReconcileMeetingActions(
  targetBasename: string,
  structured: { actions: MeetingActionProposal[]; granolaId: string | null },
): Promise<{ path: string }> {
  const db = getDb();
  const rows = await db
    .select({
      id: meetingsT.id,
      sourcePath: meetingsT.sourcePath,
      bodyMarkdown: meetingsT.bodyMarkdown,
      accountId: meetingsT.accountId,
    })
    .from(meetingsT);
  const want = targetBasename.toLowerCase();
  const row = rows.find(
    (r) =>
      r.sourcePath &&
      r.sourcePath.split("/").pop()!.replace(/\.md$/, "").toLowerCase() === want,
  );
  const blocker = reconcileBlocker(!!row, !!row?.bodyMarkdown);
  if (blocker) throw new Error(blocker);
  const note = parseMeetingNote(row!.bodyMarkdown!, row!.sourcePath!);
  await syncMeetingTasks({
    path: row!.sourcePath!,
    note,
    meetingId: row!.id,
    accountId: row!.accountId ?? null,
    origin: "proposal",
    structured,
  });
  return { path: row!.sourcePath! };
}

// Manual meeting note creation: insert-only. Returns created: false when a
// row already claims the source path (the caller turns that into a 409), so
// a hand-filed note can never clobber an existing meeting.
export async function dbCreateMeeting(
  path: string,
  content: string,
): Promise<{ path: string; created: boolean }> {
  const [existing] = await getDb()
    .select({ id: meetingsT.id })
    .from(meetingsT)
    .where(eq(meetingsT.sourcePath, path))
    .limit(1);
  if (existing) return { path, created: false };
  await dbSaveMeetingContent(path, content, "app");
  return { path, created: true };
}

// Reclassify: content transforms already applied by the caller; here we save
// content + update account linkage. source_path stays (identity, not location).
export async function dbReclassifyMeeting(
  path: string,
  content: string,
  account: string | null,
): Promise<{ commitSha: string; path: string; moved: boolean }> {
  const db = getDb();
  const accountId = await accountIdByName(account);
  const [existing] = await db
    .select({ id: meetingsT.id })
    .from(meetingsT)
    .where(eq(meetingsT.sourcePath, path))
    .limit(1);
  if (!existing) throw new Error(`Meeting not found in DB: ${path}`);
  const note = parseMeetingNote(content, path);
  await db
    .update(meetingsT)
    .set({
      bodyMarkdown: content,
      title: note.title,
      sections: note.sections,
      accountId,
      isInternal: !account,
      ...APP_EDIT,
      updatedAt: new Date(),
    })
    .where(eq(meetingsT.id, existing.id));
  return { commitSha: "", path, moved: false };
}

// Save an updated rolling-series doc (proposal approval or series creation).
export async function dbSaveSeriesContent(
  path: string,
  content: string,
  origin: "app" | "proposal" = "app",
): Promise<{ commitSha: string; path: string }> {
  const db = getDb();
  const parsed = parseSeriesDoc(content, path);
  const values = {
    name: parsed.name,
    cadence: parsed.cadence ?? null,
    status: parsed.status ?? "active",
    currentState: parsed.currentState ?? null,
    bodyMarkdown: content,
    origin,
    confirmedBy: "jordan",
    updatedAt: new Date(),
  };
  const [existing] = await db
    .select({ id: seriesT.id })
    .from(seriesT)
    .where(eq(seriesT.sourcePath, path))
    .limit(1);
  if (existing) {
    await db.update(seriesT).set(values).where(eq(seriesT.id, existing.id));
  } else {
    await db.insert(seriesT).values({ ...values, sourcePath: path });
  }
  return { commitSha: "", path };
}

// Link existing meetings to a series row by source path (manual series
// creation seeded from selected past meetings). Sets meetings.series_id, the
// same linkage the seed writes for series-named notes (lib/cutover/apply).
// Returns how many rows were linked.
export async function dbLinkMeetingsToSeries(
  seriesPath: string,
  meetingPaths: string[],
): Promise<number> {
  if (!meetingPaths.length) return 0;
  const db = getDb();
  const [s] = await db
    .select({ id: seriesT.id })
    .from(seriesT)
    .where(eq(seriesT.sourcePath, seriesPath))
    .limit(1);
  if (!s) return 0;
  const rows = await db
    .update(meetingsT)
    .set({ seriesId: s.id, updatedAt: new Date() })
    .where(inArray(meetingsT.sourcePath, meetingPaths))
    .returning({ id: meetingsT.id });
  return rows.length;
}

export async function existingMeetingBasenamesFromDb(): Promise<Set<string> | null> {
  const paths = await meetingPathsFromDb();
  if (!paths) return null;
  return new Set(
    paths.map((p) => p.split("/").pop()!.replace(/\.md$/, "").toLowerCase()),
  );
}
