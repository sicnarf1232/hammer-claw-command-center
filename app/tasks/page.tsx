import { vaultConfigured, getAllTasks } from "@/lib/vault";
import { listAccounts } from "@/lib/accounts";
import { buildAccountLookup, toTaskView, type TaskView } from "@/lib/taskView";
import { todayISO } from "@/lib/dates";
import TaskList from "@/components/TaskList";
import SetupNotice from "@/components/SetupNotice";

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
  const today = todayISO();
  try {
    const [tasks, accounts] = await Promise.all([getAllTasks(), listAccounts()]);
    const lookup = buildAccountLookup(accounts);
    views = tasks
      .filter((t) => !t.done)
      .map((t) => toTaskView(t, lookup));
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
        <TaskList tasks={views} today={today} defaultGroup="account" />
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
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Tasks</h1>
        <p className="mt-1 text-sm text-muted">
          Every open task across the vault
          {count !== undefined ? (
            <>
              , <span className="font-mono tabular-nums text-fg/70">{count}</span>{" "}
              open
            </>
          ) : null}
          . Check one off to complete it in the vault.
        </p>
      </header>
      {children}
    </div>
  );
}
