import { getOpenDueTasks, vaultConfigured } from "@/lib/vault";
import type { Task } from "@/lib/vault/types";
import TaskCard from "@/components/TaskCard";
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
    const res = await getOpenDueTasks();
    today = res.today;
    tasks = res.tasks;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the vault.";
  }

  return (
    <Page today={today}>
      {error ? (
        <div className="card max-w-2xl p-5 text-sm text-red-700">
          Could not read the vault: {error}
        </div>
      ) : tasks.length === 0 ? (
        <div className="card max-w-2xl p-5 text-sm text-slate-600">
          Nothing due today or overdue. Clear for now.
        </div>
      ) : (
        <div className="grid gap-3">
          {tasks.map((t) => (
            <TaskCard
              key={`${t.sourceFile}:${t.sourceLine}`}
              task={t}
              today={today}
            />
          ))}
        </div>
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
      <header className="mb-5">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Today
        </h1>
        <p className="text-sm text-slate-500">
          Open tasks due today or overdue{today ? `, as of ${today}` : ""}.
          Read-only, live from the vault.
        </p>
      </header>
      {children}
    </div>
  );
}
