-- Milestone 4: email firehose. Idempotent — safe to run any time in the Neon
-- SQL editor. The app also self-provisions these on first webhook call
-- (lib/firehose/schema.ts), so running this by hand is optional.

CREATE TABLE IF NOT EXISTS "emails" (
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
);

ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "sent_at" timestamptz;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "recipients" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "body_html" text;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "has_attachments" boolean NOT NULL DEFAULT false;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "needs_review" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "emails_message_id_idx" ON "emails" ("message_id");
CREATE INDEX IF NOT EXISTS "emails_thread_idx" ON "emails" ("thread_id");
CREATE INDEX IF NOT EXISTS "emails_account_idx" ON "emails" ("account_id");
CREATE INDEX IF NOT EXISTS "emails_sent_at_idx" ON "emails" ("sent_at");

CREATE TABLE IF NOT EXISTS "email_participants" (
  "id" serial PRIMARY KEY,
  "email_id" integer NOT NULL,
  "person_id" integer,
  "account_id" integer,
  "address" text,
  "name" text,
  "role" text NOT NULL DEFAULT 'to',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "email_participants_email_idx" ON "email_participants" ("email_id");
CREATE INDEX IF NOT EXISTS "email_participants_person_idx" ON "email_participants" ("person_id");
CREATE INDEX IF NOT EXISTS "email_participants_account_idx" ON "email_participants" ("account_id");
CREATE INDEX IF NOT EXISTS "email_participants_address_idx" ON "email_participants" ("address");

CREATE TABLE IF NOT EXISTS "email_attachments" (
  "id" serial PRIMARY KEY,
  "email_id" integer NOT NULL,
  "file_name" text,
  "content_type" text,
  "is_image" boolean NOT NULL DEFAULT false,
  "blob_url" text,
  "size_bytes" integer,
  "extracted_text" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "email_attachments_email_idx" ON "email_attachments" ("email_id");
