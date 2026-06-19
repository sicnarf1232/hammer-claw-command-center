CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"blob_url" text NOT NULL,
	"doc_type" text DEFAULT 'other' NOT NULL,
	"account" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"extracted_text" text,
	"notes" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "documents_account_idx" ON "documents" USING btree ("account");--> statement-breakpoint
CREATE INDEX "documents_doc_type_idx" ON "documents" USING btree ("doc_type");