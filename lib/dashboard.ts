import { sql } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { getTodayTasks } from "@/lib/today";
import { listAccounts, getAccountsWithStats, type AccountWithStats } from "@/lib/accounts";
import { buildAccountLookup, toTaskView, type TaskView } from "@/lib/taskView";
import { listThreads, accountNames } from "@/lib/firehose/read";
import { getTriageMap } from "@/lib/firehose/triage";
import { linkedTaskContextForThreads } from "@/lib/inboxContext";
import { recentNotifications, latestNotificationOfKind } from "@/lib/notify";

export interface InboxSnapshotThread {
  key: string;
  who: string;
  subject: string;
  summary: string | null;
  accountName: string | null;
  atISO: string | null;
  pathway: string | null;
  linkedTask: { title: string; due: string | null; overdue: boolean } | null;
}

export interface UpcomingMeeting {
  id: number;
  title: string;
  date: string | null;
  accountName: string | null;
  isInternal: boolean;
}

export interface DashboardData {
  today: string;
  commits: TaskView[];
  overdue: TaskView[];
  inbox: {
    needsAttention: number;
    flagged: number;
    needsReply: number;
    threads: InboxSnapshotThread[];
  };
  accounts: AccountWithStats[];
  meetings: UpcomingMeeting[];
  activity: Awaited<ReturnType<typeof recentNotifications>>;
  // Latest generated brief (morning/eod/weekly all log kind "brief"); the
  // dashboard is where briefs live post-cutover.
  brief: Awaited<ReturnType<typeof latestNotificationOfKind>>;
}

// Aggregate everything the dashboard renders in one pass. Every section is
// best-effort: a failing source degrades to empty rather than blanking the page.
export async function getDashboardData(): Promise<DashboardData> {
  const today = todayISO();

  const [tasksRes, accountList] = await Promise.all([
    getTodayTasks().catch(() => ({ today, tasks: [] as never[] })),
    listAccounts().catch(() => []),
  ]);

  const lookup = (() => {
    try {
      return buildAccountLookup(accountList);
    } catch {
      return undefined;
    }
  })();
  const views = tasksRes.tasks.map((t) => toTaskView(t, lookup));
  const commits = views.filter((t) => !t.done && (!t.due || t.due >= today));
  const overdue = views.filter((t) => !t.done && !!t.due && t.due < today);

  const [inbox, accounts, meetings, activity, brief] = await Promise.all([
    inboxSnapshot(),
    getAccountsWithStats()
      .then((r) => r.accounts.filter((a) => a.overdueCount > 0).slice(0, 6))
      .catch(() => [] as AccountWithStats[]),
    upcomingMeetings(today),
    recentNotifications(6).catch(() => [] as Awaited<ReturnType<typeof recentNotifications>>),
    latestNotificationOfKind("brief").catch(() => null),
  ]);

  return { today, commits, overdue, inbox, accounts, meetings, activity, brief };
}

async function inboxSnapshot(): Promise<DashboardData["inbox"]> {
  const empty = { needsAttention: 0, flagged: 0, needsReply: 0, threads: [] };
  if (!dbConfigured()) return empty;
  try {
    const all = await listThreads({ view: "all", limit: 400 });
    const triage = await getTriageMap(all.map((t) => t.key));

    const attention = all.filter((t) => {
      const tr = triage.get(t.key);
      return !t.archived && !tr?.reviewed && (t.flagged || t.needsReview || Boolean(tr?.needsReply));
    });
    const flagged = all.filter((t) => !t.archived && t.flagged).length;
    const needsReply = all.filter((t) => {
      const tr = triage.get(t.key);
      return !t.archived && !tr?.reviewed && Boolean(tr?.needsReply);
    }).length;

    const topThree = attention.slice(0, 3);
    const [acctMap, linkedTasks] = await Promise.all([
      accountNames(
        topThree.map((t) => t.accountId).filter((x): x is number => x != null),
      ),
      linkedTaskContextForThreads(topThree.map((t) => t.key)).catch(
        () => new Map<string, never>(),
      ),
    ]);
    const threads: InboxSnapshotThread[] = topThree.map((t) => {
      const tr = triage.get(t.key);
      const linked = linkedTasks.get(t.key);
      return {
        key: t.key,
        who: t.parties.length ? t.parties.join(", ") : "You",
        subject: t.subject,
        summary: tr?.summary ?? null,
        accountName: t.accountId != null ? (acctMap.get(t.accountId)?.name ?? null) : null,
        atISO: t.lastAt ? t.lastAt.toISOString() : null,
        pathway: tr?.pathway ?? null,
        linkedTask: linked
          ? { title: linked.title, due: linked.due, overdue: linked.overdue }
          : null,
      };
    });

    return { needsAttention: attention.length, flagged, needsReply, threads };
  } catch {
    return empty;
  }
}

// Upcoming meetings from the cutover meetings table (date is ISO text). Empty
// until a calendar feed populates future-dated rows.
async function upcomingMeetings(today: string): Promise<UpcomingMeeting[]> {
  if (!dbConfigured()) return [];
  try {
    const res = await getDb().execute(sql`
      select m.id, m.title, m.date, m.is_internal, a.name as account_name
      from meetings m
      left join accounts a on a.id = m.account_id
      where m.date is not null and m.date >= ${today}
      order by m.date asc
      limit 3
    `);
    const rows = Array.isArray(res)
      ? (res as Record<string, unknown>[])
      : (((res as { rows?: unknown }).rows ?? []) as Record<string, unknown>[]);
    return rows.map((r) => ({
      id: Number(r.id),
      title: String(r.title ?? "Untitled"),
      date: r.date ? String(r.date) : null,
      accountName: r.account_name ? String(r.account_name) : null,
      isInternal: Boolean(r.is_internal),
    }));
  } catch {
    return [];
  }
}
