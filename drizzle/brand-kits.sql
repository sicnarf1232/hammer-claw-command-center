-- Branding (Phase 3 PART B). Run this in the Neon SQL editor to create just the
-- brand_kits table, so /branding works without running the full cutover SQL.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS "brand_kits" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"workstream_key" text,
	"primary" text NOT NULL,
	"secondary" text NOT NULL,
	"accent" text NOT NULL,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "brand_kits_workstream_ux"
	ON "brand_kits" USING btree ("workstream_key");
