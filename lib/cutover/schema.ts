import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

// Self-provision the cutover tables (accounts, people, meetings, tasks, ...) the
// same way the firehose provisions its own: idempotent DDL run on demand, because
// Sensitive Vercel env vars pull blank locally so drizzle migrations cannot be
// run from dev. Cross-table foreign keys are intentionally omitted (the app
// manages integrity), matching the firehose pattern, so re-runs never fight FK
// ordering. Safe to call repeatedly.

const STATEMENTS: string[] = [
  `create table if not exists accounts (
     id serial primary key,
     name text not null,
     slug text not null,
     type text, region text, stage text, status text,
     account_number text,
     workstream text not null default 'merit',
     overview text,
     source_path text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create unique index if not exists accounts_slug_ux on accounts (slug)`,

  `create table if not exists people (
     id serial primary key,
     full_name text not null,
     classification text not null default 'unknown',
     account_id integer,
     title text, email text, phone text,
     is_self boolean not null default false,
     needs_review boolean not null default false,
     source_paths jsonb default '[]'::jsonb,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists people_classification_idx on people (classification)`,
  `create index if not exists people_needs_review_idx on people (needs_review)`,

  `create table if not exists person_aliases (
     id serial primary key,
     person_id integer not null,
     alias text not null
   )`,
  `create unique index if not exists person_aliases_alias_ux on person_aliases (alias)`,

  `create table if not exists series (
     id serial primary key,
     name text not null,
     cadence text,
     account_id integer,
     status text not null default 'active',
     current_state text,
     source_path text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,

  `create table if not exists meetings (
     id serial primary key,
     date text,
     title text not null,
     account_id integer,
     is_internal boolean not null default false,
     topic text,
     granola_id text,
     body_markdown text,
     sections jsonb,
     series_id integer,
     source_path text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists meetings_date_idx on meetings (date)`,
  `create index if not exists meetings_account_idx on meetings (account_id)`,
  `create unique index if not exists meetings_source_path_ux on meetings (source_path)`,

  `create table if not exists meeting_attendees (
     meeting_id integer not null,
     person_id integer not null
   )`,
  `create unique index if not exists meeting_attendees_pk on meeting_attendees (meeting_id, person_id)`,

  `create table if not exists tasks (
     id serial primary key,
     meeting_id integer,
     owner_person_id integer,
     account_id integer,
     text text not null,
     done boolean not null default false,
     due text,
     priority text,
     status text,
     is_jordans boolean not null default false,
     description text,
     notes text,
     source_path text,
     source_line integer,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists tasks_done_idx on tasks (done)`,
  `create index if not exists tasks_owner_idx on tasks (owner_person_id)`,

  // Provenance (Phase 2): origin says who created the row (seed = imported
  // from the vault; app = created/edited in the app; proposal = an approved AI
  // proposal). The diff/upsert seed may update or remove ONLY origin='seed'
  // rows; app and proposal rows are never touched by a re-seed.
  ...["accounts", "people", "series", "meetings", "tasks"].flatMap((t) => [
    `alter table ${t} add column if not exists origin text not null default 'seed'`,
    `alter table ${t} add column if not exists confirmed_by text`,
    `alter table ${t} add column if not exists superseded_by integer`,
  ]),

  // Account note body lists (Phase 2): situations + links ride along so the
  // DB-backed Account matches the vault parse and can round-trip on export.
  `alter table accounts add column if not exists situations jsonb`,
  `alter table accounts add column if not exists links jsonb`,

  // Full vault-task contract on the tasks table (Phase 2): standalone vault
  // tasks join meeting action items in the seed, and app-created tasks need
  // these fields directly (no source file to derive them from).
  `alter table tasks add column if not exists workstream text`,
  `alter table tasks add column if not exists customer text`,
  `alter table tasks add column if not exists created_field text`,
  `alter table tasks add column if not exists scheduled text`,
  `alter table tasks add column if not exists thread text`,
  `alter table tasks add column if not exists completed text`,
  `alter table tasks add column if not exists fields jsonb`,

  // task_emails previously existed only in never-run migration 0003; the
  // quick-add thread linking (Phase 2) needs it for real.
  `create table if not exists task_emails (
     task_id integer not null,
     email_id integer not null,
     created_at timestamptz not null default now()
   )`,
  `create unique index if not exists task_emails_pk on task_emails (task_id, email_id)`,
];

let ensured: Promise<void> | null = null;

export async function ensureCutoverSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    for (const stmt of STATEMENTS) {
      await db.execute(sql.raw(stmt));
    }
  })().catch((err) => {
    ensured = null; // allow retry on transient failure
    throw err;
  });
  return ensured;
}
