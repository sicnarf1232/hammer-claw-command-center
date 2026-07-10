import { eq, inArray, isNull, sql } from "drizzle-orm";
import {
  getDb,
  accounts as accountsT,
  meetings as meetingsT,
  series as seriesT,
  tasks as tasksT,
} from "@/lib/db";
import { cutoverActive } from "@/lib/dbSource";
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
export async function dbSaveMeetingContent(
  path: string,
  content: string,
  origin: "app" | "proposal" = "app",
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

  // Keep this meeting's task rows in step with its (dual-capture) action
  // items: update matched source lines, insert new ones. Never deletes (task
  // ids are referenced by task_meta / task_emails).
  const meetingId =
    existing?.id ??
    (await db
      .select({ id: meetingsT.id })
      .from(meetingsT)
      .where(eq(meetingsT.sourcePath, path))
      .limit(1)
      .then((r) => r[0]?.id));
  if (meetingId != null) {
    const taskRows = await db
      .select({ id: tasksT.id, sourceLine: tasksT.sourceLine })
      .from(tasksT)
      .where(eq(tasksT.sourcePath, path));
    const byLine = new Map(taskRows.map((t) => [t.sourceLine, t.id]));
    for (const ai of note.actionItems) {
      const base = {
        text: ai.text,
        done: ai.done,
        due: ai.due ?? null,
        isJordans: ai.isJordans,
        meetingId,
        accountId,
        updatedAt: new Date(),
      };
      const hit = byLine.get(ai.sourceLine);
      if (hit != null) {
        await db.update(tasksT).set(base).where(eq(tasksT.id, hit));
      } else {
        await db.insert(tasksT).values({
          ...base,
          sourcePath: path,
          sourceLine: ai.sourceLine,
          priority: ai.task?.priority ?? null,
          customer: note.customer?.display ?? null,
          origin,
          confirmedBy: "jordan",
        });
      }
    }
  }

  return { commitSha: "", path };
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
