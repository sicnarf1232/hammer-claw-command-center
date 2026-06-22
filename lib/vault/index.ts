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

// Read and parse every task in the vault (minus excluded folders).
export async function getAllTasks(): Promise<Task[]> {
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

export async function getRoster(): Promise<Roster> {
  if (!isVaultConfigured()) throw new VaultNotConfiguredError();
  const file = await getFile(ROSTER_PATH);
  if (!file) return new Map();
  return parseRoster(file.content);
}

export interface ResolvedMeeting extends MeetingsIndexRow {
  notePath: string | null; // resolved vault-relative path, or null if missing
}

// Read the meetings index and resolve each [[basename]] to a file path by
// searching the Meetings folders (docs/02: index is the source of truth).
export async function getMeetingsIndex(): Promise<ResolvedMeeting[]> {
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

export async function getMeetingNoteByPath(
  path: string,
): Promise<MeetingNote | null> {
  if (!isVaultConfigured()) throw new VaultNotConfiguredError();
  const file = await getFile(path);
  if (!file) return null;
  return parseMeetingNote(file.content, file.path);
}

// Frontmatter-only read for classification/filing decisions.
export async function getFrontmatter(path: string) {
  const file = await getFile(path);
  if (!file) return null;
  return splitFrontmatter(file.content).frontmatter;
}

// ---- Rolling-series notes ----

export type { Series } from "./series";

// All rolling-series docs (under */Meetings/_Series/), newest activity first.
export async function getSeriesList(): Promise<Series[]> {
  if (!isVaultConfigured()) return [];
  const files = (await listMarkdownFiles()).filter((f) =>
    f.path.includes(SERIES_DIR_MARKER),
  );
  if (!files.length) return [];
  const contents = await readFiles(files);
  return contents
    .filter(Boolean)
    .map((f) => parseSeriesDoc(f.content, f.path))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
}

export async function getSeriesByPath(path: string): Promise<Series | null> {
  if (!isVaultConfigured()) return null;
  const file = await getFile(path);
  if (!file) return null;
  return parseSeriesDoc(file.content, path);
}

// Incomplete "Jordan" action items pulled forward from the meetings a series
// logs (via each entry's "Source: [[note]]" link), deduped by source line. This
// is how outstanding work keeps surfacing on the rolling-series view.
export async function getSeriesOutstanding(series: Series): Promise<Task[]> {
  const basenames = new Set<string>();
  const re = /Source:\s*\[\[([^\]]+)\]\]/gi;
  for (const entry of series.log) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(entry.text))) {
      basenames.add(basenameOf(parseWikilinkBody(m[1]).target));
    }
  }
  if (!basenames.size) return [];

  const files = await listMarkdownFiles();
  const byBase = new Map<string, string>();
  for (const f of files) {
    if (!f.path.includes("/Meetings/")) continue;
    const base = f.path.split("/").pop()!.replace(/\.md$/, "");
    if (!byBase.has(base)) byBase.set(base, f.path);
  }

  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const base of basenames) {
    const path = byBase.get(base);
    if (!path) continue;
    const file = await getFile(path);
    if (!file) continue;
    const note = parseMeetingNote(file.content, path);
    for (const ai of note.actionItems) {
      if (!ai.isJordans || !ai.task || ai.task.done) continue;
      const key = `${ai.task.sourceFile}:${ai.task.sourceLine}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tasks.push(ai.task);
    }
  }
  return tasks;
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

  const files = (await listMarkdownFiles()).filter(
    (f) => f.path.includes("/Meetings/") && !f.path.includes(SERIES_DIR_MARKER),
  );
  const contents = await readFiles(files);

  const meetings: PersonMeeting[] = [];
  const items: PersonItem[] = [];
  for (const f of contents) {
    if (!f) continue;
    const note = parseMeetingNote(f.content, f.path);
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
        path: f.path,
        bucket: indexRowFromPath(f.path)?.bucket ?? "",
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
  if (!isVaultConfigured()) return [];
  const files = await listMarkdownFiles();
  const meetings: DetectMeetingInput[] = [];
  for (const f of files) {
    if (!f.path.includes("/Meetings/")) continue;
    if (f.path.includes(SERIES_DIR_MARKER)) continue; // skip the series docs
    const row = indexRowFromPath(f.path);
    if (!row) continue;
    meetings.push({
      date: row.date,
      bucket: row.bucket,
      title: row.title,
      noteBasename: row.basename,
      notePath: f.path,
    });
  }
  const existing = await getSeriesList().catch(() => []);
  return detectSeriesCandidates(meetings, existing);
}
