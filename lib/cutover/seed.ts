import {
  getAllMeetings,
  getRoster,
  getSeriesList,
  type Series,
} from "@/lib/vault";
import { listAccounts } from "@/lib/accounts";
import { reconcile, type ReconcileResult, type InMeeting } from "./reconcile";

// IO layer for the cutover seed: gather the vault data, run the pure
// reconciliation, and (optionally) write the result into the DB. The dry run
// performs NO writes, so it is safe to run any time to preview what the seed
// would create. Applying is gated on POSTGRES_URL and an explicit confirm.

export async function gatherAndReconcile(): Promise<ReconcileResult> {
  const [meetings, accounts, roster, seriesList] = await Promise.all([
    getAllMeetings(),
    listAccounts(),
    getRoster(),
    getSeriesList(),
  ]);

  const inMeetings: InMeeting[] = meetings.map((m) => ({
    sourcePath: m.path,
    date: m.date,
    title: m.title,
    customer: m.customer?.display,
    attendees: m.attendees,
    series: m.series,
    topic: m.topic,
    granolaId: m.granolaId,
    sections: m.sections,
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
    series: (seriesList as Series[]).map((s) => ({
      name: s.name,
      cadence: s.cadence,
      status: s.status,
      currentState: s.currentState,
      sourcePath: s.path,
      account: undefined,
    })),
  });
}
