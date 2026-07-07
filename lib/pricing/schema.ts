import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

// Self-provisioning schema for price agreements (Phase 3), following the
// house pattern. Mirrored in lib/db/schema.ts and drizzle/0008 for the record.
//
// account_price_agreements: one row per (account, part, min_qty tier,
// effective window). Grandfathered pricing = expires null + origin 'legacy'.
// superseded_by points at the row that replaced this one; resolution ignores
// superseded rows. NOTHING is written here without Jordan's confirmation.

const DDL: string[] = [
  `create table if not exists account_price_agreements (
     id serial primary key,
     account_id integer not null,
     part_number text not null,
     unit_price numeric(12,4) not null,
     currency text not null default 'USD',
     min_qty integer not null default 1,
     effective_date text not null,
     expires text,
     origin text not null,
     source_document_id integer,
     import_batch_id integer,
     confirmed_by text,
     superseded_by integer,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists apa_lookup_idx
     on account_price_agreements (account_id, part_number, effective_date)`,

  `create table if not exists import_rulesets (
     id serial primary key,
     name text not null,
     header_signature text not null,
     filename_pattern text,
     mapping jsonb not null,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     last_used_at timestamptz
   )`,
  `create unique index if not exists import_rulesets_sig_ux
     on import_rulesets (header_signature)`,

  `create table if not exists import_batches (
     id serial primary key,
     ruleset_id integer,
     source_document_id integer,
     account_id integer,
     file_name text,
     row_count integer,
     inserted integer,
     superseded integer,
     skipped integer,
     status text not null default 'committed',
     created_at timestamptz not null default now()
   )`,
];

let ensured: Promise<void> | null = null;

export function ensurePricingSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    for (const stmt of DDL) {
      await db.execute(sql.raw(stmt));
    }
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}
