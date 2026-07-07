// High-level vault access: read markdown via GitHub, parse with the typed
// parsers, return typed domain objects. This is the only module the app's
// pages/routes import for vault data. Parsers stay pure and unit-tested.

import {
  isVaultConfigured,
  listMarkdownFiles,
  readFiles,
  getFile,
} from "@/lib/github";
import { parseTasks } from "./tasks";
import { parseRoster } from "./roster";
import { parseMeetingNote, parseMeetingsIndex } from "./meetings";
import { parseWikilinkBody, basenameOf } from "./wikilink";
import { personNameMatches } from "./people";
import { parseSeriesDoc, SERIES_DIR_MARKER, type Series } from "./series";
import {
  detectSeriesCandidates,
  type SeriesCandidate,
  type DetectMeetingInput,
} from "./seriesDetect";
import { indexRowFromPath } from "@/lib/meetingFormat";
import { rosterFromDb } from "@/lib/peopleDb";
import {
  meetingNotesFromDb,
  meetingNoteByPathFromDb,
  meetingPathsFromDb,
  meetingsIndexFromDb,
  seriesListFromDb,
  seriesByPathFromDb,
} from "@/lib/meetingsDb";
import { splitFrontmatter } from "./frontmatter";
import { todayISO, isISODate, isOnOrBefore } from "@/lib/dates";
import type {
  Task,
  Roster,
  MeetingNote,
  MeetingsIndexRow,
  Priority,
} from "./types";

export * from "./types";
export { parseTasks } from "./tasks";
export { parseRoster, classifyName } from "./roster";
export { parseMeetingNote, parseMeetingsIndex } from "./meetings";
export { splitFrontmatter } from "./frontmatter";

export class VaultNotConfiguredError extends Error {
  constructor() {
    super(
      "Vault access is not configured. Set GITHUB_TOKEN and VAULT_REPO in the environment.",
    );
    this.name = "VaultNotConfiguredError";
  }
}

export function vaultConfigured(): boolean {
  return isVaultConfigured();
}

const ROSTER_PATH = "memory/context/merit.md";
const MEETINGS_INDEX_PATH = "100 Periodics/Meetings-Index.md";

// Folders excluded from the task scan: machinery, retired notes, and the
// read-only dashboard views (which contain Dataview queries, not source tasks).
const TASK_SCAN_EXCLUDES = ["000 OS/", "900 Archive/", "200 Dashboards/"];

function isExcluded(path: string): boolean {
  return TASK_SCAN_EXCLUDES.some((p) => path.startsWith(p));
}

// Read and parse every task from the VAULT (minus excluded folders). Used by
// the cutover seed and the export; app code reads getAllTasks() below, which
// prefers the DB once the tasks flip lands.
export async function getAllTasksFromVault(): Promise<Task[]> {
  if (!isVaultConfigured()) throw new VaultNotConfiguredError();
  const files = (await listMarkdownFiles()).filter((f) => !isExcluded(f.path));
  const contents = await readFiles(files);
  const tasks: Task[] = [];
  for (const file of contents) {
    if (!file) continue;
    try {
      const isMeeting = file.path.includes("/Meetings/");
      for (const t of parseTasks(file.content, file.path)) {
        // In meeting notes only Jordan's items (which carry an inline field
        // row) are real tasks; others' action items are tracked in the note.
        if (isMeeting && Object.keys(t.fields).length === 0) continue;
        tasks.push(t);
      }
    } catch {
      // One malformed note must not break the whole list.
    }
  }
  return tasks;
}

export async function getAllTasks(): Promise<Task[]> {
  return getAllTasksFromVault();
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, med: 1, low: 2 };

// Open tasks that are due today or overdue, sorted by due date then priority.
// "Today" is computed in the app timezone so it matches Obsidian.
export async function getOpenDueTasks(): Promise<{
  today: string;
  tasks: Task[];
}> {
  const all = await getAllTasks();
  const today = todayISO();
  const tasks = all
    .filter((t) => !t.done)
    .filter((t) => isISODate(t.due) && isOnOrBefore(t.due!, today))
    .sort((a, b) => {
      if (a.due! !== b.due!) return a.due! < b.due! ? -1 : 1;
      const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3;
      const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3;
      return pa - pb;
    });
  return { today, tasks };
}

// All open tasks (for an "everything" view), sorted by due then priority.
export async function getOpenTasks(): Promise<Task[]> {
  const all = await getAllTasks();
  return all
    .filter((t) => !t.done)
    .sort((a, b) => {
      const da = a.due ?? "9999-99-99";
      const db = b.due ?? "9999-99-99";
      if (da !== db) return da < db ? -1 : 1;
      const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3;
      const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3;
      return pa - pb;
    });
}

// The VAULT roster parse. Used by the cutover seed and the export; app code
// reads getRoster() below, which prefers the DB once seeded.
export async function getRosterFromVault(): Promise<Roster> {
  if (!isVaultConfigured()) throw new VaultNotConfiguredError();
  const file = await getFile(ROSTER_PATH);
  if (!file) return new Map();
  return parseRoster(file.content);
}

export async function getRoster(): Promise<Roster> {
  const fromDb = await rosterFromDb().catch(() => null);
  if (fromDb) return fromDb;
  return getRosterFromVault();
}

export interface ResolvedMeeting extends MeetingsIndexRow {
  notePath: string | null; // resolved vault-relative path, or null if missing
}

// Read the meetings index and resolve each [[basename]] to a file path. Once
// the cutover is seeded, the DB IS the index (rows derive from source paths);
// before that, the curated vault index file is parsed as always.
export async function getMeetingsIndex(): Promise<ResolvedMeeting[]> {
  const fromDb = await meetingsIndexFromDb().catch(() => null);
  if (fromDb) return fromDb;
  if (!isVaultConfigured()) throw new VaultNotConfiguredError();
  const indexFile = await getFile(MEETINGS_INDEX_PATH);
  if (!indexFile) return [];
  const rows = parseMeetingsIndex(indexFile.content);

  // Build a basename -> path map from all markdown under */Meetings/.
  const all = await listMarkdownFiles();
  const byBasename = new Map<string, string>();
  for (const f of all) {
    if (!/\/Meetings\//.test(f.path) && !f.path.includes("/Meetings/")) continue;
    const base = f.path.split("/").pop()!.replace(/\.md$/, "");
    if (!byBasename.has(base)) byBasename.set(base, f.path);
  }

  return rows.map((r) => ({
    ...r,
    notePath: byBasename.get(r.noteBasename) ?? null,
  }));
}

// Every meeting note (under */Meetings/, excluding rolling-series docs),
// parsed. DB-first once the cutover is seeded (rows carry the full note
// content; parseMeetingNote runs on it), else the live vault scan.
export async function getAllMeetings(): Promise<MeetingNote[]> {
  const fromDb = await meetingNotesFromDb().catch(() => null);
  if (fromDb) return fromDb;
  const files = await getMeetingFilesFromVault();
  return files
    .map((f) => parseMeetingNote(f.content, f.path))
    .sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));
}

export async function getMeetingNoteByPath(
  path: string,
): Promise<MeetingNote | null> {
  const fromDb = await meetingNoteByPathFromDb(path).catch(() => null);
  if (fromDb) return fromDb;
  if (!isVaultConfigured()) throw new VaultNotConfiguredError();
  const file = await getFile(path);
  if (!file) return null;
  return parseMeetingNote(file.content, file.path);
}

// Raw meeting note files (path + content), VAULT only. Feeds the cutover seed,
// which stores the content in the DB so the same parsers run against rows.
export async function getMeetingFilesFromVault(): Promise<
  { path: string; content: string }[]
> {
  if (!isVaultConfigured()) return [];
  const files = (await listMarkdownFiles()).filter(
    (f) => f.path.includes("/Meetings/") && !f.path.includes(SERIES_DIR_MARKER),
  );
  const contents = await readFiles(files);
  return contents.filter(Boolean).map((f) => ({ path: f.path, content: f.content }));
}

// Raw rolling-series docs (path + content), VAULT only. Seed input.
export async function getSeriesFilesFromVault(): Promise<
  { path: string; content: string }[]
> {
  if (!isVaultConfigured()) return [];
  const files = (await listMarkdownFiles()).filter((f) =>
    f.path.includes(SERIES_DIR_MARKER),
  );
  if (!files.length) return [];
  const contents = await readFiles(files);
  return contents.filter(Boolean).map((f) => ({ path: f.path, content: f.content }));
}

// Frontmatter-only read for classification/filing decisions.
export async function getFrontmatter(path: string) {
  const file = await getFile(path);
  if (!file) return null;
  return splitFrontmatter(file.content).frontmatter;
}

// ---- Rolling-series notes ----

export type { Series } from "./series";

// All rolling-series docs, newest activity first. DB-first once seeded.
export async function getSeriesList(): Promise<Series[]> {
  const fromDb = await seriesListFromDb().catch(() => null);
  if (fromDb) return fromDb;
  const files = await getSeriesFilesFromVault();
  return files
    .map((f) => parseSeriesDoc(f.content, f.path))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
}

export async function getSeriesByPath(path: string): Promise<Series | null> {
  const fromDb = await seriesByPathFromDb(path).catch(() => null);
  if (fromDb) return fromDb;
  if (!isVaultConfigured()) return null;
  const file = await getFile(path);
  if (!file) return null;
  return parseSeriesDoc(file.content, path);
}

export interface SeriesSession {
  heading: string;
  text: string;
  notePath: string | null; // resolved from the entry's "Source: [[note]]" link
}
export interface SeriesStats {
  attendance: { name: string; count: number }[]; // per participant, rolling
  sessions: number;
  actionsOpen: number;
  actionsClosed: number;
  decisions: number;
  latestDate?: string;
}
export interface SeriesView {
  outstanding: Task[]; // incomplete Jordan items, carried forward, deduped
  closed: { text: string; date?: string }[]; // completed Jordan items
  sessions: SeriesSession[]; // log entries with their source note resolved
  stats: SeriesStats;
}

// Resolve a series' log into clickable sessions and pull its outstanding
// (incomplete Jordan) action items forward. Sources meeting notes through the
// DB-first accessors, so it works identically before and after the cutover.
export async function getSeriesView(series: Series): Promise<SeriesView> {
  const allNotes = await getAllMeetings();
  const byBase = new Map<string, string>();
  const noteByPath = new Map<string, MeetingNote>();
  for (const n of allNotes) {
    const base = n.path.split("/").pop()!.replace(/\.md$/, "");
    if (!byBase.has(base)) byBase.set(base, n.path);
    noteByPath.set(n.path, n);
  }

  const firstSource = (text: string): string | undefined => {
    const m = text.match(/Source:\s*\[\[([^\]]+)\]\]/i);
    return m ? basenameOf(parseWikilinkBody(m[1]).target) : undefined;
  };

  const sessions: SeriesSession[] = series.log.map((e) => {
    const base = firstSource(e.text);
    return { heading: e.heading, text: e.text, notePath: base ? byBase.get(base) ?? null : null };
  });

  const basenames = new Set<string>();
  const re = /Source:\s*\[\[([^\]]+)\]\]/gi;
  for (const entry of series.log) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(entry.text))) {
      basenames.add(basenameOf(parseWikilinkBody(m[1]).target));
    }
  }
  const outstanding: Task[] = [];
  const closed: { text: string; date?: string }[] = [];
  const seen = new Set<string>();
  const attendance = new Map<string, number>();
  for (const p of series.participants) attendance.set(p, 0);
  let actionsOpen = 0;
  let actionsClosed = 0;
  let decisions = 0;
  let latestDate: string | undefined;
  let sessionCount = 0;

  for (const base of basenames) {
    const path = byBase.get(base);
    if (!path) continue;
    const note = noteByPath.get(path);
    if (!note) continue;
    sessionCount++;
    if (note.date && (!latestDate || note.date > latestDate)) latestDate = note.date;

    for (const p of series.participants) {
      if (note.attendees.some((a) => personNameMatches(p, a))) {
        attendance.set(p, (attendance.get(p) ?? 0) + 1);
      }
    }
    for (const ai of note.actionItems) {
      if (ai.done) actionsClosed++;
      else actionsOpen++;
      if (ai.isJordans && ai.task) {
        const key = `${ai.task.sourceFile}:${ai.task.sourceLine}`;
        if (!seen.has(key)) {
          seen.add(key);
          if (ai.task.done) closed.push({ text: ai.text, date: note.date });
          else outstanding.push(ai.task);
        }
      }
    }
    // Decisions: bullets under any "...Decisions" section.
    for (const [heading, body] of Object.entries(note.sections)) {
      if (!/decision/i.test(heading)) continue;
      decisions += body.split("\n").filter((l) => /^\s*[-*]\s+/.test(l)).length;
    }
  }

  return {
    outstanding,
    closed,
    sessions,
    stats: {
      attendance: series.participants
        .map((name) => ({ name, count: attendance.get(name) ?? 0 }))
        .sort((a, b) => b.count - a.count),
      sessions: sessionCount,
      actionsOpen,
      actionsClosed,
      decisions,
      latestDate: latestDate ?? series.updated,
    },
  };
}

export type { SeriesCandidate } from "./seriesDetect";

// ---- People ----

export interface PersonItem {
  text: string;
  done: boolean;
  due?: string;
  meetingTitle: string;
  meetingDate?: string;
  sourceFile: string;
  sourceLine: number;
  task?: Task; // present when it's a real (Jordan) task, for an interactive row
}
export interface PersonMeeting {
  title: string;
  date?: string;
  path: string;
  bucket: string;
}
export interface PersonProfile {
  name: string;
  company?: string; // from the roster, when known
  meetings: PersonMeeting[]; // newest first
  items: PersonItem[]; // action items owned by this person (open first)
}

// Aggregate everything the vault knows about a person: their company (roster),
// the meetings they attend, and the action items they own across all notes.
export async function getPersonProfile(name: string): Promise<PersonProfile> {
  if (!isVaultConfigured()) return { name, meetings: [], items: [] };

  const roster = await getRoster().catch(() => new Map() as Roster);
  let company: string | undefined;
  for (const e of roster.values()) {
    if (e.account && personNameMatches(name, e.name)) {
      company = e.account;
      break;
    }
  }

  const allNotes = await getAllMeetings();

  const meetings: PersonMeeting[] = [];
  const items: PersonItem[] = [];
  for (const note of allNotes) {
    let owns = false;
    for (const ai of note.actionItems) {
      const owner = ai.owner ?? (ai.isJordans ? "Jordan Francis" : undefined);
      if (!owner || !personNameMatches(name, owner)) continue;
      owns = true;
      items.push({
        text: ai.text,
        done: ai.done,
        due: ai.due,
        meetingTitle: note.title,
        meetingDate: note.date,
        sourceFile: ai.sourceFile,
        sourceLine: ai.sourceLine,
        task: ai.task,
      });
    }
    // Owning an action item counts as attending the meeting, even when the
    // attendee list omits them.
    const isAttendee = note.attendees.some((a) => personNameMatches(name, a));
    if (isAttendee || owns) {
      meetings.push({
        title: note.title,
        date: note.date,
        path: note.path,
        bucket: indexRowFromPath(note.path)?.bucket ?? "",
      });
    }
  }

  meetings.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));
  items.sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (b.meetingDate ?? "").localeCompare(a.meetingDate ?? ""),
  );
  return { name, company, meetings, items };
}

// Recurring meetings that are not yet a series. Scans every meeting note file
// (the index is only a curated 30-row slice), derives a title/date/bucket from
// each filename, and clusters them, excluding anything an existing series
// already covers. Cheap: file listing only, no note reads.
export async function getSeriesCandidates(): Promise<SeriesCandidate[]> {
  // DB-first: meeting paths come from the meetings table once seeded.
  const dbPaths = await meetingPathsFromDb().catch(() => null);
  let paths: string[];
  if (dbPaths) {
    paths = dbPaths;
  } else {
    if (!isVaultConfigured()) return [];
    paths = (await listMarkdownFiles())
      .map((f) => f.path)
      .filter((p) => p.includes("/Meetings/") && !p.includes(SERIES_DIR_MARKER));
  }
  const meetings: DetectMeetingInput[] = [];
  for (const path of paths) {
    const row = indexRowFromPath(path);
    if (!row) continue;
    meetings.push({
      date: row.date,
      bucket: row.bucket,
      title: row.title,
      noteBasename: row.basename,
      notePath: path,
    });
  }
  const existing = await getSeriesList().catch(() => []);
  return detectSeriesCandidates(meetings, existing);
}
