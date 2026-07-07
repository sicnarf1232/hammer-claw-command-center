import { dbConfigured } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { getOpenDueTasks } from "@/lib/vault";
import { cutoverActive } from "@/lib/dbSource";
import { readDueTasksFromSnapshot } from "@/lib/tasksSnapshot";
import type { Task } from "@/lib/vault/types";

// Choose the fastest correct source for the Today view. Post-cutover the
// tasks table is authoritative (getOpenDueTasks reads it via getAllTasks).
// Pre-cutover: prefer the legacy vault_tasks snapshot when populated, else
// the live vault read.
export async function getTodayTasks(): Promise<{
  today: string;
  tasks: Task[];
  source: "db" | "live";
}> {
  const today = todayISO();

  if (await cutoverActive()) {
    const due = await getOpenDueTasks();
    return { today: due.today, tasks: due.tasks, source: "db" };
  }

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
