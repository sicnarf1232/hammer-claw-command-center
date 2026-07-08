-- Agent settings (2026-07-08): per-agent enable switch and model choice for
-- the /agents oversight view. Self-provisioned at runtime by
-- lib/agents/settings.ts; this file is the hand-run record.
CREATE TABLE IF NOT EXISTS "agent_settings" (
  "agent" text PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT true,
  "model_choice" text NOT NULL DEFAULT 'default',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
