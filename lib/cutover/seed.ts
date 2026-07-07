import {
  getAllTasksFromVault,
  getMeetingFilesFromVault,
  getRosterFromVault,
  getSeriesFilesFromVault,
} from "@/lib/vault";
import { parseMeetingNote } from "@/lib/vault/meetings";
import { parseSeriesDoc } from "@/lib/vault/series";
import { listAccountsFromVault } from "@/lib/accounts";
import {
  reconcile,
  type ReconcileResult,
  type InMeeting,
  type InStandaloneTask,
} from "./reconcile";

// IO layer for the cutover seed: gather the vault data, run the pure
// reconciliation, and (optionally) write the result into the DB. The dry run
// performs NO writes, so it is safe to run any time to preview what the seed
// would create. Applying is gated on POSTGRES_URL and an explicit confirm.

export async function gatherAndReconcile(): Promise<ReconcileResult> {
  // Vault readers ONLY: the seed's whole point is vault -> DB, so it must
  // never read through the flipped (DB-first) accessors. Raw file content is
  // kept alongside the parse; the DB stores it so rows re-parse identically.
  const [meetingFiles, accounts, roster, seriesFiles, vaultTasks] =
    await Promise.all([
      getMeetingFilesFromVault(),
      listAccountsFromVault(),
      getRosterFromVault(),
      getSeriesFilesFromVault(),
      getAllTasksFromVault(),
    ]);
  const meetings = meetingFiles.map((f) => ({
    note: parseMeetingNote(f.content, f.path),
    content: f.content,
  }));
  const seriesList = seriesFiles.map((f) => ({
    doc: parseSeriesDoc(f.content, f.path),
    content: f.content,
  }));

  // Jordan's standalone vault tasks (the Tasks page content). Meeting action
  // items arrive separately below; reconcile dedupes dual-captured ones by
  // (sourcePath, sourceLine).
  const standaloneTasks: InStandaloneTask[] = vaultTasks.map((t) => ({
    sourcePath: t.sourceFile,
    sourceLine: t.sourceLine,
    title: t.title,
    done: t.done,
    due: t.due,
    priority: t.priority,
    status: t.taskStatus,
    description: t.description || undefined,
    notes: t.notes || undefined,
    customer:
      t.customer === "internal" ? "internal" : t.customer?.display ?? undefined,
    workstream: typeof t.workstream === "string" ? t.workstream : undefined,
    created: t.created,
    scheduled: t.scheduled,
    thread: t.thread,
    completed: t.completed,
    fields: Object.keys(t.fields ?? {}).length ? t.fields : undefined,
  }));

  const inMeetings: InMeeting[] = meetings.map(({ note: m, content }) => ({
    sourcePath: m.path,
    date: m.date,
    title: m.title,
    customer: m.customer?.display,
    attendees: m.attendees,
    series: m.series,
    topic: m.topic,
    granolaId: m.granolaId,
    sections: m.sections,
    bodyMarkdown: content,
    actionItems: m.actionItems.map((ai) => ({
      text: ai.text,
      done: ai.done,
      owner: ai.owner,
      isJordans: ai.isJordans,
      due: ai.due,
      priority: ai.task?.priority,
      status: ai.task?.taskStatus,
      description: ai.task?.description,
      notes: ai.task?.notes,
      sourceLine: ai.sourceLine,
    })),
  }));

  return reconcile({
    accounts: accounts.map((a) => ({
      name: a.name,
      slug: a.slug,
      type: a.type,
      region: a.region,
      stage: a.stage,
      status: a.status,
      accountNumber: a.accountNumber,
      overview: a.overview,
      situations: a.situations.length ? a.situations : undefined,
      links: a.links.length ? a.links : undefined,
      sourcePath: a.path,
      contacts: a.contacts.map((c) => ({
        name: c.name,
        title: c.title,
        email: c.email,
        phone: c.phone,
      })),
    })),
    roster: Array.from(roster.values()).map((e) => ({
      name: e.name,
      classification: e.classification,
      account: e.account,
    })),
    meetings: inMeetings,
    series: seriesList.map(({ doc: s, content }) => ({
      name: s.name,
      cadence: s.cadence,
      status: s.status,
      currentState: s.currentState,
      bodyMarkdown: content,
      sourcePath: s.path,
      account: undefined,
    })),
    standaloneTasks,
  });
}
