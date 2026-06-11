import { NextResponse, type NextRequest } from "next/server";
import { sql as dsql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ONE-TIME schema bootstrap. Runs inside Vercel where POSTGRES_URL is populated
// (the Neon integration marks it sensitive, so it cannot be pulled locally).
// Protected by the app login (middleware) plus a ?confirm gate. Remove this
// route after the tables exist. Statements are IF NOT EXISTS, so it is safe to
// re-run.
const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "app_meta" (
    "key" text PRIMARY KEY NOT NULL,
    "value" text,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "email_queue" (
    "id" serial PRIMARY KEY NOT NULL,
    "message_id" text NOT NULL,
    "received_at" timestamp with time zone,
    "from_name" text,
    "from_email" text,
    "to_addrs" jsonb DEFAULT '[]'::jsonb,
    "cc" jsonb DEFAULT '[]'::jsonb,
    "subject" text,
    "body_preview" text,
    "body_html" text,
    "body_text" text,
    "has_attachments" boolean DEFAULT false NOT NULL,
    "web_link" text,
    "status" text DEFAULT 'new' NOT NULL,
    "workstream" text,
    "account" text,
    "filed_path" text,
    "filed_commit" text,
    "replied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "notifications" (
    "id" serial PRIMARY KEY NOT NULL,
    "kind" text NOT NULL,
    "title" text NOT NULL,
    "body" text,
    "channel" text DEFAULT 'in-app' NOT NULL,
    "meta" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "sent_at" timestamp with time zone,
    "dedupe_key" text
  )`,
  `CREATE TABLE IF NOT EXISTS "quote_drafts" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" text DEFAULT 'Untitled quote' NOT NULL,
    "customer" text,
    "workstream" text DEFAULT 'merit' NOT NULL,
    "line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "vault_tasks" (
    "id" text PRIMARY KEY NOT NULL,
    "source_file" text NOT NULL,
    "source_line" integer NOT NULL,
    "done" boolean DEFAULT false NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "notes" text,
    "workstream" text,
    "customer" text,
    "due" text,
    "priority" text,
    "created_field" text,
    "thread" text,
    "fields" jsonb,
    "synced_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "message_id" text,
    "signature_valid" boolean DEFAULT false NOT NULL,
    "kind" text DEFAULT 'email' NOT NULL,
    "payload" jsonb NOT NULL,
    "received_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "email_queue_message_id_ux" ON "email_queue" USING btree ("message_id")`,
  `CREATE INDEX IF NOT EXISTS "email_queue_status_idx" ON "email_queue" USING btree ("status")`,
  `CREATE INDEX IF NOT EXISTS "vault_tasks_due_idx" ON "vault_tasks" USING btree ("due")`,
  `CREATE INDEX IF NOT EXISTS "vault_tasks_done_idx" ON "vault_tasks" USING btree ("done")`,
];

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("confirm") !== "1") {
    return NextResponse.json(
      { error: "Add ?confirm=1 to run the one-time migration." },
      { status: 400 },
    );
  }
  if (!dbConfigured()) {
    return NextResponse.json(
      { error: "POSTGRES_URL not set in this environment." },
      { status: 503 },
    );
  }
  const db = getDb();
  const applied: string[] = [];
  for (const stmt of STATEMENTS) {
    await db.execute(dsql.raw(stmt));
    applied.push(stmt.split("\n")[0].trim());
  }
  // Verify the tables now exist.
  const tables = await db.execute(
    dsql.raw(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    ),
  );
  const rows = (tables as unknown as { rows?: unknown }).rows ?? tables;
  return NextResponse.json({ ok: true, applied, tables: rows });
}
