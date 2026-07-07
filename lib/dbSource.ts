import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";

// Cutover gate: the DB is the source for accounts/people/meetings/series/tasks
// once the Phase 2 diff/upsert seed has RUN (it stamps app_meta
// 'cutover_last_apply'; the old wipe-and-reload seed never did). Data from the
// pre-Phase-2 seed is incomplete (no standalone tasks, no note content), so an
// accounts-count gate would flip reads onto stale data the moment this
// deploys. Before the stamp exists every reader falls back to the live vault
// parse. Cached briefly per warm lambda; a just-run seed flips it on the next
// request.

let cache: { value: boolean; at: number } | null = null;
const TTL_MS = 30_000;

export async function cutoverActive(): Promise<boolean> {
  if (!dbConfigured()) return false;
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  try {
    const res = await getDb().execute(
      sql`select value from app_meta where key = 'cutover_last_apply' limit 1`,
    );
    const rows = Array.isArray(res)
      ? (res as Array<{ value: string | null }>)
      : (((res as { rows?: unknown }).rows ?? []) as Array<{ value: string | null }>);
    const value = Boolean(rows[0]?.value);
    cache = { value, at: now };
    return value;
  } catch {
    cache = { value: false, at: now };
    return false;
  }
}

// For tests / after seeding in-process.
export function resetCutoverCache(): void {
  cache = null;
}
