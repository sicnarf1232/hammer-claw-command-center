CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text,
	"region" text,
	"stage" text,
	"status" text,
	"account_number" text,
	"workstream" text DEFAULT 'merit' NOT NULL,
	"overview" text,
	"source_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_attendees" (
	"meeting_id" integer NOT NULL,
	"person_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text,
	"title" text NOT NULL,
	"account_id" integer,
	"is_internal" boolean DEFAULT false NOT NULL,
	"topic" text,
	"granola_id" text,
	"body_markdown" text,
	"sections" jsonb,
	"series_id" integer,
	"source_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"classification" text DEFAULT 'unknown' NOT NULL,
	"account_id" integer,
	"title" text,
	"email" text,
	"phone" text,
	"is_self" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"source_paths" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cadence" text,
	"account_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"current_state" text,
	"source_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer,
	"owner_person_id" integer,
	"account_id" integer,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"due" text,
	"priority" text,
	"status" text,
	"is_jordans" boolean DEFAULT false NOT NULL,
	"description" text,
	"notes" text,
	"source_path" text,
	"source_line" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_aliases" ADD CONSTRAINT "person_aliases_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_slug_ux" ON "accounts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_attendees_pk" ON "meeting_attendees" USING btree ("meeting_id","person_id");--> statement-breakpoint
CREATE INDEX "meetings_date_idx" ON "meetings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "meetings_account_idx" ON "meetings" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_source_path_ux" ON "meetings" USING btree ("source_path");--> statement-breakpoint
CREATE INDEX "people_classification_idx" ON "people" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "people_needs_review_idx" ON "people" USING btree ("needs_review");--> statement-breakpoint
CREATE UNIQUE INDEX "person_aliases_alias_ux" ON "person_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "tasks_done_idx" ON "tasks" USING btree ("done");--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("owner_person_id");