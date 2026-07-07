-- Phase 2 (2026-07-07): cutover provenance + task_emails runtime coverage.
-- FOR THE RECORD ONLY: lib/cutover/schema.ts self-provisions all of this.
-- Idempotent; safe to run by hand in the Neon SQL editor.

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'seed';
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "confirmed_by" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "superseded_by" integer;

ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'seed';
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "confirmed_by" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "superseded_by" integer;

ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'seed';
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "confirmed_by" text;
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "superseded_by" integer;

ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'seed';
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "confirmed_by" text;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "superseded_by" integer;

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'seed';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "confirmed_by" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "superseded_by" integer;

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "workstream" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "customer" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "created_field" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "scheduled" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "thread" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completed" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "fields" jsonb;

CREATE TABLE IF NOT EXISTS "task_emails" (
  "task_id" integer NOT NULL,
  "email_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_emails_pk" ON "task_emails" ("task_id", "email_id");
