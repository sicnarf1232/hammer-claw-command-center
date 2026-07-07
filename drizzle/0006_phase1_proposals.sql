-- Phase 1 (2026-07-06): AI proposals + email_triage provenance.
-- FOR THE RECORD ONLY: the app self-provisions all of this at runtime
-- (lib/proposals/schema.ts, lib/firehose/schema.ts). Safe to run by hand in
-- the Neon SQL editor; every statement is idempotent.

CREATE TABLE IF NOT EXISTS "ai_proposals" (
  "id" serial PRIMARY KEY,
  "kind" text NOT NULL,
  "dedupe_key" text,
  "parent_id" integer,
  "payload" jsonb NOT NULL,
  "summary" text,
  "status" text NOT NULL DEFAULT 'pending',
  "model" text,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "decided_at" timestamptz,
  "executed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ai_proposals_status_idx" ON "ai_proposals" ("status");
CREATE INDEX IF NOT EXISTS "ai_proposals_dedupe_idx" ON "ai_proposals" ("kind", "dedupe_key");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_proposals_pending_ux"
  ON "ai_proposals" ("kind", "dedupe_key") WHERE "status" = 'pending';

ALTER TABLE "email_triage" ADD COLUMN IF NOT EXISTS "ai_generated" boolean NOT NULL DEFAULT true;
ALTER TABLE "email_triage" ADD COLUMN IF NOT EXISTS "ai_snapshot" jsonb;
UPDATE "email_triage" SET "model" = 'unknown (pre-fix)' WHERE "model" = 'claude-haiku-4-5-20251001';
