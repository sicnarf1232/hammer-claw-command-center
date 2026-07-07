import { isNotNull } from "drizzle-orm";
import {
  getDb,
  meetings as meetingsT,
  series as seriesT,
  tasks as tasksT,
} from "@/lib/db";
import { cutoverActive } from "@/lib/dbSource";
import { getFile, writeFileForExport, listMarkdownFiles } from "@/lib/github";
import { listAccountsFromDb } from "@/lib/accountsDb";
import { DB_TASK_FILE, tasksFromDb } from "@/lib/tasksDb";
import {
  renderAccountNote,
  renderCommandCenterTasksFile,
  applyDoneStates,
  CC_TASKS_PATH,
} from "./renderers";
import {
  rebuildMeetingsIndex,
  indexRowFromPath,
  type MeetingRow,
} from "@/lib/meetingFormat";
import { todayISO } from "@/lib/dates";

// The deliberate vault export (DB-CUTOVER stage 5): render the DB back into
// canonical vault markdown, committed file by file through the ONLY write path
// allowed in readonly mode (writeFileForExport). Unchanged files are skipped,
// so re-running exports only the drift.

export type ExportScope = "all" | "accounts" | "meetings" | "series" | "tasks" | "index";

export interface ExportResult {
  written: string[];
  skipped: number; // files already identical
  errors: Array<{ path: string; error: string }>;
}

const MEETINGS_INDEX_PATH = "100 Periodics/Meetings-Index.md";

export async function runExport(scope: ExportScope): Promise<ExportResult> {
  if (!(await cutoverActive())) {
    throw new Error("Export needs the cutover seed (the DB is not the source yet).");
  }
  const result: ExportResult = { written: [], skipped: 0, errors: [] };
  const want = (s: Exclude<ExportScope, "all">) => scope === "all" || scope === s;

  const writeIfChanged = async (path: string, content: string, what: string) => {
    try {
      const existing = await getFile(path).catch(() => null);
      const normalized = content.replace(/\r\n/g, "\n");
      if (existing && existing.content.replace(/\r\n/g, "\n") === normalized) {
        result.skipped += 1;
        return;
      }
      await writeFileForExport({
        path,
        content,
        message: `app export: ${what} ${todayISO()}`,
      });
      result.written.push(path);
    } catch (err) {
      result.errors.push({
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const db = getDb();

  if (want("accounts")) {
    const accounts = (await listAccountsFromDb()) ?? [];
    for (const a of accounts) {
      await writeIfChanged(a.path, renderAccountNote(a), `account ${a.name}`);
    }
  }

  if (want("meetings")) {
    const rows = await db
      .select({ path: meetingsT.sourcePath, body: meetingsT.bodyMarkdown, title: meetingsT.title })
      .from(meetingsT)
      .where(isNotNull(meetingsT.bodyMarkdown));
    for (const m of rows) {
      if (!m.path || !m.body) continue;
      await writeIfChanged(m.path, m.body, `meeting ${m.title}`);
    }
  }

  if (want("series")) {
    const rows = await db
      .select({ path: seriesT.sourcePath, body: seriesT.bodyMarkdown, name: seriesT.name })
      .from(seriesT)
      .where(isNotNull(seriesT.bodyMarkdown));
    for (const s of rows) {
      if (!s.path || !s.body) continue;
      await writeIfChanged(s.path, s.body, `series ${s.name}`);
    }
  }

  if (want("tasks")) {
    // (a) App-created tasks: one one-writer file rendered from the DB.
    const all = (await tasksFromDb()) ?? [];
    const appTasks = all.filter((t) => t.sourceFile === DB_TASK_FILE);
    if (appTasks.length) {
      await writeIfChanged(
        CC_TASKS_PATH,
        renderCommandCenterTasksFile(appTasks),
        `command-center tasks (${appTasks.length})`,
      );
    }
    // (b) Seeded tasks: flip done-states in their original files to match the DB.
    const seeded = await db
      .select({
        sourcePath: tasksT.sourcePath,
        sourceLine: tasksT.sourceLine,
        done: tasksT.done,
        completed: tasksT.completed,
      })
      .from(tasksT)
      .where(isNotNull(tasksT.sourcePath));
    const byFile = new Map<string, Array<{ sourceLine: number; done: boolean; completed?: string }>>();
    for (const t of seeded) {
      if (t.sourcePath == null || t.sourceLine == null) continue;
      const list = byFile.get(t.sourcePath) ?? [];
      list.push({
        sourceLine: t.sourceLine,
        done: t.done,
        completed: t.completed ?? todayISO(),
      });
      byFile.set(t.sourcePath, list);
    }
    for (const [path, changes] of byFile) {
      try {
        const file = await getFile(path).catch(() => null);
        if (!file) continue;
        const next = applyDoneStates(file.content, changes);
        if (next === null) {
          result.skipped += 1;
          continue;
        }
        await writeFileForExport({
          path,
          content: next,
          message: `app export: task states in ${path.split("/").pop()} ${todayISO()}`,
        });
        result.written.push(path);
      } catch (err) {
        result.errors.push({
          path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (want("index")) {
    try {
      const indexFile = await getFile(MEETINGS_INDEX_PATH).catch(() => null);
      if (indexFile) {
        const files = await listMarkdownFiles();
        const rows = files
          .map((f) => indexRowFromPath(f.path))
          .filter((r): r is MeetingRow => r !== null);
        const stamp = `${todayISO()} (app export: ${rows.length} meetings indexed)`;
        const updated = rebuildMeetingsIndex(indexFile.content, rows, stamp);
        if (updated !== indexFile.content) {
          await writeFileForExport({
            path: MEETINGS_INDEX_PATH,
            content: updated,
            message: `app export: rebuild meetings index ${todayISO()}`,
          });
          result.written.push(MEETINGS_INDEX_PATH);
        } else {
          result.skipped += 1;
        }
      }
    } catch (err) {
      result.errors.push({
        path: MEETINGS_INDEX_PATH,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
