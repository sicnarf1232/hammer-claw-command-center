import { and, eq, lte, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { vaultTasks } from "@/lib/db/schema";
import { getAllTasks } from "@/lib/vault";
import { appMeta } from "@/lib/db/schema";
import type { Task } from "@/lib/vault/types";

// Rebuild the parsed-task snapshot from the live vault so the UI can read
// Postgres for speed. The vault stays the source of truth (docs/01).
export async function syncTasksSnapshot(): Promise<number> {
  const tasks = await getAllTasks();
  const db = getDb();

  const rows = tasks.map((t) => ({
    id: `${t.sourceFile}:${t.sourceLine}`,
    sourceFile: t.sourceFile,
    sourceLine: t.sourceLine,
    done: t.done,
    title: t.title,
    description: t.description || null,
    notes: t.notes || null,
    workstream: typeof t.workstream === "string" ? t.workstream : null,
    customer:
      t.customer === "internal"
        ? "internal"
        : (t.customer?.display ?? null),
    due: t.due ?? null,
    priority: t.priority ?? null,
    createdField: t.created ?? null,
    thread: t.thread ?? null,
    fields: t.fields,
  }));

  // Snapshot replace: clear then bulk insert in chunks.
  await db.delete(vaultTasks);
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(vaultTasks).values(rows.slice(i, i + CHUNK));
  }

  await db
    .insert(appMeta)
    .values({ key: "tasks_synced_at", value: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: new Date().toISOString(), updatedAt: new Date() },
    });

  return rows.length;
}

// Read open due/overdue tasks from the snapshot, reconstructed into Task shape
// so the existing TaskCard renders them unchanged.
export async function readDueTasksFromSnapshot(today: string): Promise<Task[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(vaultTasks)
    .where(
      and(
        eq(vaultTasks.done, false),
        isNotNull(vaultTasks.due),
        lte(vaultTasks.due, today),
      ),
    );

  const tasks: Task[] = rows.map((r) => ({
    done: r.done,
    title: r.title,
    fields: r.fields ?? {},
    description: r.description ?? "",
    notes: r.notes ?? "",
    workstream: r.workstream ?? undefined,
    customer:
      r.customer === "internal"
        ? "internal"
        : r.customer
          ? { target: r.customer, basename: r.customer, display: r.customer }
          : undefined,
    due: r.due ?? undefined,
    priority: (r.priority as Task["priority"]) ?? undefined,
    created: r.createdField ?? undefined,
    thread: r.thread ?? undefined,
    sourceFile: r.sourceFile,
    sourceLine: r.sourceLine,
  }));

  const order = { high: 0, med: 1, low: 2 } as const;
  return tasks.sort((a, b) => {
    if ((a.due ?? "") !== (b.due ?? "")) return (a.due ?? "") < (b.due ?? "") ? -1 : 1;
    const pa = a.priority ? order[a.priority] : 3;
    const pb = b.priority ? order[b.priority] : 3;
    return pa - pb;
  });
}

export async function snapshotCount(): Promise<number> {
  const db = getDb();
  const rows = await db.select({ id: vaultTasks.id }).from(vaultTasks);
  return rows.length;
}
