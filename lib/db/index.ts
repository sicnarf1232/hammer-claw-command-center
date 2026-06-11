import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Lazy, nullable DB client. The app degrades gracefully when POSTGRES_URL is
// not set (Phase 0, or before the Vercel Postgres store exists): callers check
// dbConfigured() and show a setup notice instead of crashing.

export type DB = NeonHttpDatabase<typeof schema>;

let _db: DB | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

export function getDb(): DB {
  if (!process.env.POSTGRES_URL) {
    throw new Error(
      "POSTGRES_URL is not set. Create a Vercel Postgres store and run `npm run db:push`.",
    );
  }
  if (_db) return _db;
  const sql = neon(process.env.POSTGRES_URL);
  _db = drizzle(sql, { schema });
  return _db;
}

export { schema };
export * from "./schema";
