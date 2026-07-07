import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

// Self-provisioning schema for AI proposals, following the firehose/cutover
// pattern (idempotent DDL on demand; Sensitive Vercel env vars pull blank
// locally so migrations cannot run from dev). Mirrored in lib/db/schema.ts for
// types and in drizzle/0006_phase1_proposals.sql for the hand-run record.

const DDL: string[] = [
  `create table if not exists ai_proposals (
     id serial primary key,
     kind text not null,
     dedupe_key text,
     parent_id integer,
     payload jsonb not null,
     summary text,
     status text not null default 'pending',
     model text,
     error text,
     created_at timestamptz not null default now(),
     decided_at timestamptz,
     executed_at timestamptz
   )`,
  `create index if not exists ai_proposals_status_idx on ai_proposals (status)`,
  `create index if not exists ai_proposals_dedupe_idx on ai_proposals (kind, dedupe_key)`,
  // Backstop: at most one PENDING proposal per (kind, dedupe_key). The store
  // enforces this in logic too; the partial index makes racing pulls safe.
  `create unique index if not exists ai_proposals_pending_ux
     on ai_proposals (kind, dedupe_key) where status = 'pending'`,
];

let ensured: Promise<void> | null = null;

export function ensureProposalsSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    for (const stmt of DDL) {
      await db.execute(sql.raw(stmt));
    }
  })().catch((err) => {
    ensured = null; // allow retry on transient failure
    throw err;
  });
  return ensured;
}
