import { vaultConfigured } from "@/lib/vault";
import { getTodayTasks } from "@/lib/today";
import { listAccounts } from "@/lib/accounts";
import { buildAccountLookup, toTaskView, type TaskView } from "@/lib/taskView";
import type { Task } from "@/lib/vault/types";
import TaskList from "@/components/TaskList";
import SetupNotice from "@/components/SetupNotice";

// Always read fresh from the vault; never statically cache the task list.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TodayPage() {
  if (!vaultConfigured()) {
    return (
      <Page>
        <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />
      </Page>
    );
  }

  let today = "";
  let tasks: Task[] = [];
  let error: string | null = null;
  try {
    const res = await getTodayTasks();
    today = res.today;
    tasks = res.tasks;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the vault.";
  }

  // Resolve accounts for task -> account links (best-effort; never block).
  let views: TaskView[] = [];
  if (!error) {
    let lookup;
    try {
      lookup = buildAccountLookup(await listAccounts());
    } catch {
      lookup = undefined;
    }
    views = tasks.map((t) => toTaskView(t, lookup));
  }

  return (
    <Page today={today}>
      {error ? (
        <div className="card max-w-2xl border-danger/30 p-5 text-sm text-danger">
          Could not read the vault: {error}
        </div>
      ) : views.length === 0 ? (
        <div className="card max-w-2xl p-8 text-center">
          <div className="text-sm font-medium text-fg">
            Nothing due today or overdue
          </div>
          <p className="mt-1 text-sm text-muted">You are clear for now.</p>
        </div>
      ) : (
        <TaskList tasks={views} today={today} defaultGroup="due" />
      )}
    </Page>
  );
}

function Page({
  children,
  today,
}: {
  children: React.ReactNode;
  today?: string;
}) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="display-title text-2xl text-fg">Today</h1>
        <p className="mt-1 text-sm text-muted">
          Open tasks due today or overdue
          {today ? (
            <>
              {" "}
              as of <span className="font-mono text-fg/70">{today}</span>
            </>
          ) : null}
          . Check one off to complete it in the vault.
        </p>
      </header>
      {children}
    </div>
  );
}
