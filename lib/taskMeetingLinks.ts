import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import {
  tasks as tasksT,
  taskMeetings as taskMeetingsT,
  meetings as meetingsT,
  meetingAttendees as meetingAttendeesT,
  people as peopleT,
} from "@/lib/db/schema";
import { accountNames } from "@/lib/firehose/read";
import { getOpenTasks } from "@/lib/vault";
import { listAccounts } from "@/lib/accounts";
import { toTaskView, buildAccountLookup, type TaskView } from "@/lib/taskView";
import {
  matchTasksForMeeting as pureMatchTasksForMeeting,
  matchMeetingsForTask as pureMatchMeetingsForTask,
  type MatchableMeeting,
  type MeetingMatch,
  type TaskMeetingMatch,
} from "@/lib/taskMeetingMatch";
import type { MatchableTask } from "@/lib/taskEmailMatch";
import { DB_TASK_FILE } from "@/lib/taskEmailLinks";

// DB-backed reads/writes for the task<->meeting link (dev-feedback #14 Part
// 3). Mirrors lib/taskEmailLinks.ts exactly: every write here is a CONFIRMED
// link (Jordan approved it), this module never stores an unconfirmed
// suggestion. See lib/taskMeetingMatch.ts for the pure scorer (itself a thin
// wrapper around lib/taskEmailMatch.ts's shared scoreTaskContentPair) and
// lib/db/schema.ts for the task_meetings table + provenance columns.

// Self-provisions task_meetings from scratch: unlike task_emails (which
// already existed from an earlier cutover run before dev-feedback #11 added
// its provenance columns), this table has never been created anywhere, so
// the lazy path here does the full CREATE TABLE, not just an ALTER. The same
// DDL is also documented in lib/cutover/schema.ts for parity with task_emails,
// but that only re-runs when Jordan explicitly re-applies the cutover; this
// is the path real requests actually hit.
let ensured: Promise<void> | null = null;
async function ensureTaskMeetingsSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    await db.execute(sql`create table if not exists task_meetings (
      task_id integer not null,
      meeting_id integer not null,
      ai_generated boolean not null default false,
      confirmed_by text,
      created_at timestamptz not null default now()
    )`);
    await db.execute(
      sql`create unique index if not exists task_meetings_pk on task_meetings (task_id, meeting_id)`,
    );
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}

// Resolve a TaskView identity (sourceFile/sourceLine) to the underlying
// tasks.id row. Duplicated from lib/taskEmailLinks.ts's private helper of the
// same shape rather than imported, so this file has no edit surface in
// common with that module (same reasoning as taskEmailLinks.ts's own comment
// on resolveTaskRowId).
async function resolveTaskRowId(sourceFile: string, sourceLine: number): Promise<number | null> {
  const db = getDb();
  if (sourceFile === DB_TASK_FILE) return sourceLine;
  const [row] = await db
    .select({ id: tasksT.id })
    .from(tasksT)
    .where(and(eq(tasksT.sourcePath, sourceFile), eq(tasksT.sourceLine, sourceLine)))
    .limit(1);
  return row?.id ?? null;
}

export interface ConfirmMeetingLinkInput {
  sourceFile: string;
  sourceLine: number;
  meetingIds: number[];
  aiGenerated: boolean; // true when this link came from a suggested match Jordan confirmed
}

// Write a CONFIRMED link. Called only after Jordan acts (the tasks page
// "Link" button), never automatically.
export async function confirmTaskMeetingLinks(
  input: ConfirmMeetingLinkInput,
): Promise<{ taskDbId: number }> {
  if (!dbConfigured()) throw new Error("Database not configured.");
  await ensureTaskMeetingsSchema();
  const rowId = await resolveTaskRowId(input.sourceFile, input.sourceLine);
  if (rowId == null) {
    throw new Error(`Task not found in DB: ${input.sourceFile}:${input.sourceLine}`);
  }
  const ids = Array.from(new Set(input.meetingIds)).filter((n) => Number.isInteger(n));
  if (ids.length) {
    const db = getDb();
    await db
      .insert(taskMeetingsT)
      .values(
        ids.map((meetingId) => ({
          taskId: rowId,
          meetingId,
          aiGenerated: input.aiGenerated,
          confirmedBy: "jordan",
        })),
      )
      .onConflictDoUpdate({
        target: [taskMeetingsT.taskId, taskMeetingsT.meetingId],
        set: { aiGenerated: input.aiGenerated, confirmedBy: "jordan" },
      });
  }
  return { taskDbId: rowId };
}

export interface LinkedMeetingRef {
  meetingId: number;
  title: string | null;
  date: string | null;
  accountName: string | null;
  aiGenerated: boolean;
  // Vault path (meetings.source_path): the meeting detail view is routed by
  // path (/meetings?note=<path>), not by DB id, matching every other
  // meeting-linking surface in the app (see app/people/[name]/page.tsx,
  // components/AccountsHub.tsx). Null for a DB-only meeting with no vault
  // counterpart; the UI just skips the deep link in that case.
  sourcePath: string | null;
}

// Forward lookup for the tasks page: "Linked meetings (N)".
export async function linkedMeetingsForTask(
  sourceFile: string,
  sourceLine: number,
): Promise<LinkedMeetingRef[]> {
  if (!dbConfigured()) return [];
  try {
    await ensureTaskMeetingsSchema();
    const rowId = await resolveTaskRowId(sourceFile, sourceLine);
    if (rowId == null) return [];
    const db = getDb();
    const rows = await db
      .select({
        meetingId: meetingsT.id,
        title: meetingsT.title,
        date: meetingsT.date,
        accountId: meetingsT.accountId,
        sourcePath: meetingsT.sourcePath,
        aiGenerated: taskMeetingsT.aiGenerated,
      })
      .from(taskMeetingsT)
      .innerJoin(meetingsT, eq(taskMeetingsT.meetingId, meetingsT.id))
      .where(eq(taskMeetingsT.taskId, rowId))
      .orderBy(desc(meetingsT.date));
    const accIds = rows.map((r) => r.accountId).filter((n): n is number => n != null);
    const accMap = await accountNames(accIds).catch(() => new Map());
    return rows.map((r) => ({
      meetingId: r.meetingId,
      title: r.title,
      date: r.date,
      accountName: r.accountId != null ? accMap.get(r.accountId)?.name ?? null : null,
      aiGenerated: r.aiGenerated,
      sourcePath: r.sourcePath,
    }));
  } catch {
    return [];
  }
}

// ---- Matching wrapper (DB-fetching glue around the pure scorer) ----
// Only the tasks-page direction ("this task -> candidate meetings") is
// wired up, matching the required surface from dev-feedback #14 Part 3. A
// symmetric "meeting -> candidate tasks" wrapper is not needed yet: the
// meeting note detail view has no linkable-tasks UI to feed it (see
// components/TaskEmailLink.tsx's header comment / the build report for why).

function toMatchable(t: TaskView): MatchableTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    notes: t.notes ?? null,
    customer: t.customer ?? null,
  };
}

async function openMatchableTasks(): Promise<MatchableTask[]> {
  const [tasks, accounts] = await Promise.all([
    getOpenTasks().catch(() => []),
    listAccounts().catch(() => []),
  ]);
  const lookup = buildAccountLookup(accounts);
  return tasks
    .map((t) => toTaskView(t, lookup))
    .filter((t) => t.workstream !== "nextech")
    .map(toMatchable);
}

// Attendee full names for a batch of meetings, keyed by meeting id. Best
// effort: an empty map on any failure just means the named-attendee signal
// contributes nothing, the part-number/account signals still work.
async function attendeeNamesByMeeting(meetingIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!meetingIds.length) return out;
  try {
    const db = getDb();
    const rows = await db
      .select({ meetingId: meetingAttendeesT.meetingId, fullName: peopleT.fullName })
      .from(meetingAttendeesT)
      .innerJoin(peopleT, eq(meetingAttendeesT.personId, peopleT.id))
      .where(inArray(meetingAttendeesT.meetingId, meetingIds));
    for (const r of rows) {
      const list = out.get(r.meetingId) ?? [];
      list.push(r.fullName);
      out.set(r.meetingId, list);
    }
  } catch {
    /* best effort */
  }
  return out;
}

// Tasks page: "this recent meeting may relate to this task." Scoped to the
// most recent meetings (optionally on the task's own account) rather than
// every meeting ever pulled, the same bounded-read tradeoff
// suggestEmailsForTask makes in lib/taskEmailLinks.ts.
export async function suggestMeetingsForTask(
  task: MatchableTask,
  sourceFile: string,
  sourceLine: number,
  accountId: number | null,
  limit = 3,
): Promise<(MeetingMatch & { title: string | null; date: string | null; sourcePath: string | null })[]> {
  if (!dbConfigured()) return [];
  await ensureTaskMeetingsSchema();
  const db = getDb();
  const rows = await db
    .select({
      id: meetingsT.id,
      title: meetingsT.title,
      date: meetingsT.date,
      topic: meetingsT.topic,
      bodyMarkdown: meetingsT.bodyMarkdown,
      sections: meetingsT.sections,
      accountId: meetingsT.accountId,
      sourcePath: meetingsT.sourcePath,
    })
    .from(meetingsT)
    .where(accountId != null ? eq(meetingsT.accountId, accountId) : undefined)
    .orderBy(desc(meetingsT.date))
    .limit(40);

  const [accMap, attendeeMap] = await Promise.all([
    accountNames(rows.map((r) => r.accountId).filter((n): n is number => n != null)).catch(
      () => new Map<number, { name: string; slug: string }>(),
    ),
    attendeeNamesByMeeting(rows.map((r) => r.id)),
  ]);

  const candidates = rows.map((r) => ({
    meetingId: r.id,
    meeting: {
      accountName: r.accountId != null ? accMap.get(r.accountId)?.name ?? null : null,
      title: r.title,
      topic: r.topic,
      bodyMarkdown: r.bodyMarkdown,
      sections: (r.sections as Record<string, string> | null) ?? null,
      attendees: attendeeMap.get(r.id) ?? [],
    } as MatchableMeeting,
  }));

  const already = await linkedMeetingsForTask(sourceFile, sourceLine).catch(() => []);
  const linkedIds = new Set(already.map((m) => m.meetingId));

  const scored = pureMatchMeetingsForTask(task, candidates, limit + 5).filter(
    (m) => !linkedIds.has(m.meetingId),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return scored.slice(0, limit).map((m) => {
    const row = byId.get(m.meetingId)!;
    return { ...m, title: row.title, date: row.date, sourcePath: row.sourcePath };
  });
}

// Unused re-exports kept for symmetry with lib/taskEmailLinks.ts and in case
// a future meeting-detail "linked tasks" surface wants the reverse direction
// without duplicating the pure-scorer wiring.
export type { TaskMeetingMatch };
export { pureMatchTasksForMeeting as matchTasksForMeeting };
