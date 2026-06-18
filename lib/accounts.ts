import { listMarkdownFiles, readFiles } from "@/lib/github";
import { parseAccount, slugify } from "@/lib/vault/accounts";
import { getAllTasks, getMeetingsIndex } from "@/lib/vault";
import type { Account, Task } from "@/lib/vault/types";

const CUSTOMERS_DIR = "300 Merit/Customers";

export interface AccountWithStats extends Account {
  openTaskCount: number;
  overdueCount: number;
  nextDue?: string; // earliest due among open tasks
}

export interface AccountDetail extends AccountWithStats {
  openTasks: Task[];
  recentDone: Task[];
}

// Read and parse every customer account note.
export async function listAccounts(): Promise<Account[]> {
  const files = (await listMarkdownFiles(CUSTOMERS_DIR)).filter((f) =>
    f.path.endsWith(".md"),
  );
  const contents = await readFiles(files);
  const accounts: Account[] = [];
  for (const file of contents) {
    if (!file) continue;
    try {
      accounts.push(parseAccount(file.content, file.path));
    } catch {
      // One malformed note must not break the list.
    }
  }
  return accounts.sort((a, b) => a.name.localeCompare(b.name));
}

// Match keys let us link a task's customer wikilink to an account, tolerant of
// punctuation/heading suffixes ("Boston Scientific" vs "Boston Scientific (BSC)").
function matchKeys(a: Account): string[] {
  const base = a.path.split("/").pop()!.replace(/\.md$/, "");
  return Array.from(
    new Set([norm(a.name), norm(base), a.slug.replace(/-/g, "")]),
  ).filter(Boolean);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
}

function taskCustomerName(t: Task): string | null {
  if (!t.customer || t.customer === "internal") return null;
  return t.customer.basename;
}

// All accounts with open-task stats joined from the live task scan.
export async function getAccountsWithStats(): Promise<{
  accounts: AccountWithStats[];
  today: string;
}> {
  const [accounts, tasks] = await Promise.all([listAccounts(), getAllTasks()]);
  const today = new Date().toISOString().slice(0, 10);

  const byKey = new Map<string, AccountWithStats>();
  const stats: AccountWithStats[] = accounts.map((a) => ({
    ...a,
    openTaskCount: 0,
    overdueCount: 0,
  }));
  for (const a of stats) for (const k of matchKeys(a)) byKey.set(k, a);

  for (const t of tasks) {
    if (t.done) continue;
    const cust = taskCustomerName(t);
    if (!cust) continue;
    const acc = byKey.get(norm(cust));
    if (!acc) continue;
    acc.openTaskCount++;
    if (t.due && t.due < today) acc.overdueCount++;
    if (t.due && (!acc.nextDue || t.due < acc.nextDue)) acc.nextDue = t.due;
  }

  // Sort: accounts with overdue first, then by open count, then name.
  stats.sort(
    (a, b) =>
      b.overdueCount - a.overdueCount ||
      b.openTaskCount - a.openTaskCount ||
      a.name.localeCompare(b.name),
  );
  return { accounts: stats, today };
}

export async function getAccountBySlug(
  slug: string,
): Promise<AccountDetail | null> {
  const [accounts, tasks] = await Promise.all([listAccounts(), getAllTasks()]);
  const account = accounts.find((a) => a.slug === slug);
  if (!account) return null;

  const keys = new Set(matchKeys(account));
  const mine = tasks.filter((t) => {
    const c = taskCustomerName(t);
    return c ? keys.has(norm(c)) : false;
  });
  const today = new Date().toISOString().slice(0, 10);

  const openTasks = mine
    .filter((t) => !t.done)
    .sort((a, b) => (a.due ?? "9999") .localeCompare(b.due ?? "9999"));
  const recentDone = mine
    .filter((t) => t.done && t.completed)
    .sort((a, b) => (b.completed ?? "").localeCompare(a.completed ?? ""))
    .slice(0, 8);

  const overdueCount = openTasks.filter((t) => t.due && t.due < today).length;
  const nextDue = openTasks.find((t) => t.due)?.due;

  return {
    ...account,
    openTaskCount: openTasks.length,
    overdueCount,
    nextDue,
    openTasks,
    recentDone,
  };
}

// ---- Accounts hub (master-detail) ----

export interface HubTask {
  text: string;
  due?: string;
  overdue: boolean;
  priority?: string;
}
export interface HubMeeting {
  date: string;
  title: string;
  notePath: string | null;
}
export interface AccountHub extends AccountWithStats {
  openTasks: HubTask[];
  recentMeetings: HubMeeting[];
}

// Assemble everything the master-detail Accounts page needs in one server pass:
// account notes + the (cached) task scan + the meetings index. Avoids a
// per-account fetch when the user selects an account (selection is client-side).
export async function getAccountsHub(): Promise<{
  accounts: AccountHub[];
  today: string;
}> {
  const [accounts, tasks, meetings] = await Promise.all([
    listAccounts(),
    getAllTasks(),
    getMeetingsIndex().catch(() => []),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const byKey = new Map<string, AccountHub>();
  const hub: AccountHub[] = accounts.map((a) => ({
    ...a,
    openTaskCount: 0,
    overdueCount: 0,
    openTasks: [],
    recentMeetings: [],
  }));
  for (const a of hub) for (const k of matchKeys(a)) byKey.set(k, a);

  for (const t of tasks) {
    if (t.done) continue;
    const cust = taskCustomerName(t);
    if (!cust) continue;
    const acc = byKey.get(norm(cust));
    if (!acc) continue;
    const overdue = !!(t.due && t.due < today);
    acc.openTaskCount++;
    if (overdue) acc.overdueCount++;
    if (t.due && (!acc.nextDue || t.due < acc.nextDue)) acc.nextDue = t.due;
    acc.openTasks.push({
      text: t.title.replace(/\[[A-Za-z][\w-]*::[^\]]*\]/g, "").trim(),
      due: t.due,
      overdue,
      priority: t.priority,
    });
  }

  for (const m of meetings) {
    const acc = accountForMeeting(byKey, m.bucket, m.notePath);
    if (acc) acc.recentMeetings.push({ date: m.date, title: m.title, notePath: m.notePath });
  }

  for (const a of hub) {
    a.openTasks.sort((x, y) => (x.due ?? "9999").localeCompare(y.due ?? "9999"));
    a.recentMeetings.sort((x, y) => y.date.localeCompare(x.date));
    a.recentMeetings = a.recentMeetings.slice(0, 6);
  }

  hub.sort(
    (a, b) =>
      b.overdueCount - a.overdueCount ||
      b.openTaskCount - a.openTaskCount ||
      a.name.localeCompare(b.name),
  );
  return { accounts: hub, today };
}

// Link a meeting (index row) to an account by its bucket, then by the account
// folder segment in the note path ("300 Merit/Meetings/<Account>/...").
function accountForMeeting(
  byKey: Map<string, AccountHub>,
  bucket: string,
  notePath: string | null,
): AccountHub | undefined {
  const byBucket = byKey.get(norm(bucket));
  if (byBucket) return byBucket;
  if (notePath) {
    const seg = notePath.split("/Meetings/")[1]?.split("/")[0];
    if (seg) return byKey.get(norm(seg));
  }
  return undefined;
}

export { slugify };
