import { dbConfigured } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { getOpenDueTasks } from "@/lib/vault";
import { readDueTasksFromSnapshot } from "@/lib/tasksSnapshot";
import type { Task } from "@/lib/vault/types";

// Choose the fastest correct source for the Today view. Prefer the Postgres
// snapshot (populated by the sync cron) when it has data; otherwise read the
// vault live via GitHub. The vault is always the source of truth either way.
export async function getTodayTasks(): Promise<{
  today: string;
  tasks: Task[];
  source: "db" | "live";
}> {
  const today = todayISO();

  if (dbConfigured()) {
    try {
      const snap = await readDueTasksFromSnapshot(today);
      if (snap.length > 0) return { today, tasks: snap, source: "db" };
    } catch {
      // Snapshot read failed (table missing before first db:push) -> live.
    }
  }

  const live = await getOpenDueTasks();
  return { today: live.today, tasks: live.tasks, source: "live" };
}
