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
      tasks.push(...parseTasks(file.content, file.path));
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
