import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";

// Tiny self-provisioning key/value store for app settings (voice profile, and
// future single-user preferences). Follows the firehose pattern: idempotent DDL
// run on first use, no migration step needed (Sensitive Vercel env vars pull
// blank locally, so we cannot run drizzle migrations from dev). Degrades to no-op
// when the DB is not configured.

let ensured: Promise<void> | null = null;

async function ensureSettingsSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await getDb().execute(
        sql.raw(
          `create table if not exists app_settings (
             key text primary key,
             value jsonb,
             updated_at timestamptz not null default now()
           )`,
        ),
      );
    } catch (err) {
      ensured = null; // allow retry on a transient failure
      throw err;
    }
  })();
  return ensured;
}

export async function getSetting<T>(key: string): Promise<T | null> {
  if (!dbConfigured()) return null;
  try {
    await ensureSettingsSchema();
    const res = await getDb().execute(
      sql`select value from app_settings where key = ${key} limit 1`,
    );
    const rows = Array.isArray(res)
      ? (res as { value: unknown }[])
      : (((res as { rows?: unknown }).rows ?? []) as { value: unknown }[]);
    return (rows[0]?.value as T) ?? null;
  } catch {
    return null;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  if (!dbConfigured()) return;
  await ensureSettingsSchema();
  const json = JSON.stringify(value);
  await getDb().execute(
    sql`insert into app_settings (key, value, updated_at)
        values (${key}, ${json}::jsonb, now())
        on conflict (key) do update set value = ${json}::jsonb, updated_at = now()`,
  );
}
