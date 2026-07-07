import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";

// Cutover gate: the DB is the source for accounts/people/meetings/series/tasks
// once it is configured AND seeded (accounts count > 0). Before that every
// reader falls back to the live vault parse, so a fresh deploy without a seed
// still works. Cached briefly per warm lambda; a just-run seed flips it on the
// next request.

let cache: { value: boolean; at: number } | null = null;
const TTL_MS = 30_000;

export async function cutoverActive(): Promise<boolean> {
  if (!dbConfigured()) return false;
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  try {
    const res = await getDb().execute(sql`select count(*)::int as n from accounts`);
    const rows = Array.isArray(res)
      ? (res as Array<{ n: number }>)
      : (((res as { rows?: unknown }).rows ?? []) as Array<{ n: number }>);
    const value = (rows[0]?.n ?? 0) > 0;
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
