import { vaultConfigured, getAllTasks } from "@/lib/vault";
import { listAccounts } from "@/lib/accounts";
import { buildAccountLookup, toTaskView, type TaskView } from "@/lib/taskView";
import { todayISO } from "@/lib/dates";
import { getTaskMeta, type TaskMeta } from "@/lib/taskMeta";
import TasksBoard from "@/components/TasksBoard";
import QuickAddTask from "@/components/QuickAddTask";
import SetupNotice from "@/components/SetupNotice";
import { cutoverActive } from "@/lib/dbSource";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TasksPage() {
  if (!vaultConfigured()) {
    return (
      <Page>
        <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />
      </Page>
    );
  }

  let views: TaskView[] = [];
  let error: string | null = null;
  let meta: Record<string, TaskMeta> = {};
  let accountNames: string[] = [];
  const today = todayISO();
  const canQuickAdd = await cutoverActive().catch(() => false);
  try {
    const [tasks, accounts] = await Promise.all([getAllTasks(), listAccounts()]);
    accountNames = accounts.map((a) => a.name);
    const lookup = buildAccountLookup(accounts);
    views = tasks
      .filter((t) => !t.done)
      .map((t) => toTaskView(t, lookup))
      // Nextech is a separate business that was removed from the app; never
      // show its tasks. Merit is the default view (TasksTable workstream
      // filter); Sloan/Personal stay available behind that filter.
      .filter((t) => t.workstream !== "nextech");
    // App-side augmentation (checklist, last customer update) for the cards.
    const metaMap = await getTaskMeta(views.map((v) => v.id)).catch(() => new Map());
    meta = Object.fromEntries(metaMap);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the vault.";
  }

  return (
    <Page count={views.length}>
      {error ? (
        <div className="card max-w-2xl border-danger/30 p-5 text-sm text-danger">
          Could not read the vault: {error}
        </div>
      ) : (
        <>
          {canQuickAdd ? <QuickAddTask accounts={accountNames} /> : null}
          <TasksBoard tasks={views} today={today} meta={meta} accounts={accountNames} canEdit={canQuickAdd} />
        </>
      )}
    </Page>
  );
}

function Page({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="display-title text-2xl text-fg">Tasks</h1>
        <p className="mt-1 text-sm text-muted">
          Open tasks, sorted and filterable by account, type, and status. Merit
          OEM by default
          {count !== undefined ? (
            <>
              {" "}
              (<span className="font-mono tabular-nums text-fg/70">{count}</span>{" "}
              across workstreams)
            </>
          ) : null}
          . Check one off to complete it in the vault.
        </p>
      </header>
      {children}
    </div>
  );
}
