CREATE TABLE "brand_kits" (
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
--> statement-breakpoint
CREATE UNIQUE INDEX "brand_kits_workstream_ux" ON "brand_kits" USING btree ("workstream_key");