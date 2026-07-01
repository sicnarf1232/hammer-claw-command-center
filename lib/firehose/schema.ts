import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

// Self-provisioning schema for the email firehose (Milestone 4). The endpoint
// runs on Vercel where POSTGRES_URL is set, but we cannot run a migration from a
// local dev box (the DB URL is a Sensitive Vercel var that pulls down empty), so
// the firehose creates/extends everything it needs on first use. Every statement
// is idempotent (IF NOT EXISTS) and avoids cross-table foreign keys, so it works
// whether or not the cutover tables (accounts/people) were ever pushed.
//
// The same statements live in drizzle/0005_email_firehose.sql for the record.
const DDL: string[] = [
  // emails: create if missing (full shape, no FK), then add the firehose columns
  // in case the table already exists from migration 0003 without them.
  `CREATE TABLE IF NOT EXISTS "emails" (
    "id" serial PRIMARY KEY,
    "message_id" text,
    "thread_id" text,
    "direction" text NOT NULL DEFAULT 'inbound',
    "received_at" timestamptz,
    "sent_at" timestamptz,
    "from_name" text,
    "from_email" text,
    "to_addrs" jsonb DEFAULT '[]'::jsonb,
    "cc" jsonb DEFAULT '[]'::jsonb,
    "recipients" jsonb DEFAULT '[]'::jsonb,
    "subject" text,
    "body_preview" text,
    "body_text" text,
    "body_html" text,
    "has_attachments" boolean NOT NULL DEFAULT false,
    "web_link" text,
    "account_id" integer,
    "person_id" integer,
    "needs_review" boolean NOT NULL DEFAULT false,
    "created_at" timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "sent_at" timestamptz`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "recipients" jsonb DEFAULT '[]'::jsonb`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "body_html" text`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "has_attachments" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "needs_review" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "flagged" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "flagged_at" timestamptz`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'new'`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "replied_at" timestamptz`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "read" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "read_at" timestamptz`,
  `CREATE INDEX IF NOT EXISTS "emails_message_id_idx" ON "emails" ("message_id")`,
  `CREATE INDEX IF NOT EXISTS "emails_flagged_idx" ON "emails" ("flagged")`,
  `CREATE INDEX IF NOT EXISTS "emails_thread_idx" ON "emails" ("thread_id")`,
  `CREATE INDEX IF NOT EXISTS "emails_account_idx" ON "emails" ("account_id")`,
  `CREATE INDEX IF NOT EXISTS "emails_sent_at_idx" ON "emails" ("sent_at")`,

  `CREATE TABLE IF NOT EXISTS "email_participants" (
    "id" serial PRIMARY KEY,
    "email_id" integer NOT NULL,
    "person_id" integer,
    "account_id" integer,
    "address" text,
    "name" text,
    "role" text NOT NULL DEFAULT 'to',
    "created_at" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "email_participants_email_idx" ON "email_participants" ("email_id")`,
  `CREATE INDEX IF NOT EXISTS "email_participants_person_idx" ON "email_participants" ("person_id")`,
  `CREATE INDEX IF NOT EXISTS "email_participants_account_idx" ON "email_participants" ("account_id")`,
  `CREATE INDEX IF NOT EXISTS "email_participants_address_idx" ON "email_participants" ("address")`,

  `CREATE TABLE IF NOT EXISTS "email_attachments" (
    "id" serial PRIMARY KEY,
    "email_id" integer NOT NULL,
    "file_name" text,
    "content_type" text,
    "is_image" boolean NOT NULL DEFAULT false,
    "blob_url" text,
    "size_bytes" integer,
    "extracted_text" text,
    "created_at" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "email_attachments_email_idx" ON "email_attachments" ("email_id")`,
  `ALTER TABLE "email_attachments" ADD COLUMN IF NOT EXISTS "is_inline" boolean NOT NULL DEFAULT false`,

  `CREATE TABLE IF NOT EXISTS "email_triage" (
    "id" serial PRIMARY KEY,
    "thread_key" text NOT NULL,
    "summary" text,
    "pathway" text,
    "priority" text,
    "needs_reply" boolean NOT NULL DEFAULT false,
    "signature" text,
    "model" text,
    "updated_at" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "email_triage_thread_key_ux" ON "email_triage" ("thread_key")`,
  `ALTER TABLE "email_triage" ADD COLUMN IF NOT EXISTS "reviewed" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "email_triage" ADD COLUMN IF NOT EXISTS "manual" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "email_triage" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz`,
];

// Run the DDL once per warm lambda. A failed run does not latch, so the next
// request retries. Concurrent IF NOT EXISTS statements are safe to race.
let ensured: Promise<void> | null = null;

export function ensureFirehoseSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    for (const stmt of DDL) {
      await db.execute(sql.raw(stmt));
    }
  })().catch((err) => {
    ensured = null; // allow retry on the next request
    throw err;
  });
  return ensured;
}
