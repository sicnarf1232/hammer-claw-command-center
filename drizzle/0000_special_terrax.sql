CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
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
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"channel" text DEFAULT 'in-app' NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"dedupe_key" text
);
--> statement-breakpoint
CREATE TABLE "quote_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'Untitled quote' NOT NULL,
	"customer" text,
	"workstream" text DEFAULT 'merit' NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_tasks" (
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
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"kind" text DEFAULT 'email' NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_queue_message_id_ux" ON "email_queue" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "email_queue_status_idx" ON "email_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vault_tasks_due_idx" ON "vault_tasks" USING btree ("due");--> statement-breakpoint
CREATE INDEX "vault_tasks_done_idx" ON "vault_tasks" USING btree ("done");