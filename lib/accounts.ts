import { listMarkdownFiles, readFiles } from "@/lib/github";
import { parseAccount, slugify } from "@/lib/vault/accounts";
import { getAllTasks } from "@/lib/vault";
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

export { slugify };
