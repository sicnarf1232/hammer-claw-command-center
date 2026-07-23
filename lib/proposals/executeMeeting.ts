import { eq } from "drizzle-orm";
import { getFile, listMarkdownFiles, writeFile } from "@/lib/github";
import { addAccountContacts } from "@/lib/writeback";
import { cutoverActive } from "@/lib/dbSource";
import { getDb, series as seriesT } from "@/lib/db";
import {
  dbSaveMeetingContent,
  dbReconcileMeetingActions,
  dbSaveSeriesContent,
  existingMeetingBasenamesFromDb,
} from "@/lib/meetingsDb";
import {
  parseSeriesDoc,
  applyMeetingToSeries,
  mmdd,
} from "@/lib/vault/series";
import {
  rebuildMeetingsIndex,
  indexRowFromPath,
  type MeetingRow,
} from "@/lib/meetingFormat";
import { todayISO } from "@/lib/dates";
import type {
  MeetingFilePayload,
  ProposalRow,
  SeriesUpdatePayload,
} from "./types";

const MEETINGS_INDEX_PATH = "100 Periodics/Meetings-Index.md";

export interface ExecuteOutcome {
  // Approving a meeting note changes the meeting file set, so the index needs
  // one rebuild at the end of the batch (not one per proposal).
  indexRebuildNeeded: boolean;
  // Non-fatal issues (e.g. contact write failed); stored on the proposal row.
  warnings: string[];
}

// Execute one APPROVED proposal: perform exactly the vault writes the Granola
// pull used to do inline, from the frozen payload. Throws on failure; the
// caller records status.
export async function executeProposal(row: ProposalRow): Promise<ExecuteOutcome> {
  if (row.kind === "meeting-file") {
    return executeMeetingFile(row.payload as MeetingFilePayload);
  }
  if (row.kind === "series-update") {
    return executeSeriesUpdate(row.payload as SeriesUpdatePayload);
  }
  throw new Error(`Unknown proposal kind: ${row.kind}`);
}

// Pure decision for the post-cutover approval write (Codex D-review blocker 2,
// tested in executeMeeting.test.ts):
//  - save-new: meeting is new; save content and sync reviewed links.
//  - reconcile-existing: meeting already exists; PRESERVE its stored content
//    (never overwrite with the stale staged copy) but reconcile Jordan's
//    reviewed action links against the current content. A reconcile failure
//    throws and fails the execution; it must not approve with only a warning.
//  - skip-legacy: meeting exists and the payload predates structured actions;
//    there are no reviewed links to land, so skipping remains correct.
export type MeetingApprovalPlan = "save-new" | "reconcile-existing" | "skip-legacy";

export function meetingApprovalPlan(
  alreadyExists: boolean,
  hasStructuredActions: boolean,
): MeetingApprovalPlan {
  if (!alreadyExists) return "save-new";
  return hasStructuredActions ? "reconcile-existing" : "skip-legacy";
}

async function executeMeetingFile(p: MeetingFilePayload): Promise<ExecuteOutcome> {
  const warnings: string[] = [];

  // Post-cutover: the approved payload lands as a DB row (origin 'proposal';
  // Jordan's action items sync into tasks). The vault copy is an export concern.
  if (await cutoverActive()) {
    const basenames = await existingMeetingBasenamesFromDb();
    const base = p.path.split("/").pop()!.replace(/\.md$/, "").toLowerCase();
    const plan = meetingApprovalPlan(
      basenames?.has(base) ?? false,
      !!p.actions?.length,
    );
    if (plan === "save-new") {
      // Slice D: the reviewed action contract rides along so tasks are
      // reconciled by stable action id and confirmed owner links persist.
      await dbSaveMeetingContent(p.path, p.content, "proposal", {
        actions: p.actions ?? null,
        granolaId: p.granolaId ?? null,
      });
    } else if (plan === "reconcile-existing") {
      // Throws on failure: the proposal then lands in status 'error', never
      // a false success that silently dropped Jordan's confirmed links.
      const { path } = await dbReconcileMeetingActions(
        { path: p.path, granolaId: p.granolaId ?? null },
        { actions: p.actions!, granolaId: p.granolaId ?? null },
      );
      warnings.push(
        `Meeting already existed at ${path}; content preserved, reviewed action links reconciled.`,
      );
    } else {
      warnings.push(
        "Meeting already existed at execution time; write skipped (legacy payload, no reviewed links to apply).",
      );
    }
    if (p.contactsToAdd && p.contactsToAdd.names.length) {
      try {
        await addAccountContacts(
          p.contactsToAdd.accountPath,
          p.contactsToAdd.names.map((name) => ({ name })),
        );
      } catch (e) {
        warnings.push(
          `Contacts not added to ${p.contactsToAdd.accountName}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    return { indexRebuildNeeded: false, warnings };
  }

  // Pre-cutover: re-check at execution time; if the note landed some other
  // way since staging, do not duplicate it.
  const existing = await getFile(p.path).catch(() => null);
  if (existing) {
    warnings.push("Note already existed at execution time; write skipped.");
  } else {
    await writeFile({
      path: p.path,
      content: p.content,
      message: `app: file Granola meeting ${p.title} ${p.date} (approved)`,
    });
  }

  // Best-effort: contacts the meeting surfaced. A failure here must not fail
  // the approval.
  if (p.contactsToAdd && p.contactsToAdd.names.length) {
    try {
      await addAccountContacts(
        p.contactsToAdd.accountPath,
        p.contactsToAdd.names.map((name) => ({ name })),
      );
    } catch (e) {
      warnings.push(
        `Contacts not added to ${p.contactsToAdd.accountName}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  return { indexRebuildNeeded: true, warnings };
}

async function executeSeriesUpdate(p: SeriesUpdatePayload): Promise<ExecuteOutcome> {
  // Fresh read: the deterministic merge runs against the doc as it is NOW, so
  // an edit made between staging and approval is preserved, not clobbered.
  // Post-cutover the doc lives in the series row; pre-cutover in the vault.
  const dbActive = await cutoverActive();
  let currentContent: string | null = null;
  if (dbActive) {
    const [row] = await getDb()
      .select({ body: seriesT.bodyMarkdown })
      .from(seriesT)
      .where(eq(seriesT.sourcePath, p.seriesPath))
      .limit(1);
    currentContent = row?.body ?? null;
  }
  if (currentContent == null) {
    const file = await getFile(p.seriesPath);
    if (!file) throw new Error(`Series doc not found: ${p.seriesPath}`);
    currentContent = file.content;
  }
  const series = parseSeriesDoc(currentContent, p.seriesPath);
  const newContent = applyMeetingToSeries(
    series,
    {
      date: p.date,
      title: p.meetingTitle,
      bullets: p.logBullets,
      meetingBasename: p.meetingBasename,
    },
    p.currentState,
    mmdd(p.date),
  );
  if (dbActive) {
    await dbSaveSeriesContent(p.seriesPath, newContent, "proposal");
  } else {
    await writeFile({
      path: p.seriesPath,
      content: newContent,
      message: `app: update series ${p.seriesName} ${p.date} (approved)`,
    });
  }
  return { indexRebuildNeeded: false, warnings: [] };
}

// Rebuild the meetings index from the actual files on disk. Called once per
// approval batch when any meeting note was written (same self-healing rebuild
// the pull used to run).
export async function rebuildIndexAfterApprovals(): Promise<void> {
  const indexFile = await getFile(MEETINGS_INDEX_PATH);
  if (!indexFile) return;
  const files = await listMarkdownFiles();
  const rows = files
    .map((f) => indexRowFromPath(f.path))
    .filter((r): r is MeetingRow => r !== null);
  const stamp = `${todayISO()} (app proposal approvals: ${rows.length} meetings indexed)`;
  const updated = rebuildMeetingsIndex(indexFile.content, rows, stamp);
  if (updated !== indexFile.content) {
    await writeFile({
      path: MEETINGS_INDEX_PATH,
      content: updated,
      message: `app: rebuild meetings index ${todayISO()}`,
    });
  }
}
