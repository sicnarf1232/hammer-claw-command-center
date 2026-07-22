-- Meeting-action stable identity (Slice B, 2026-07-22).
--
-- Adds a stable, line-independent identity column for meeting action items so
-- later slices stop keying tasks by Markdown source_line. The column is
-- nullable and additive: every existing task row is valid with NULL, and no
-- Slice B code path writes it (Slice D populates it when the writer reconciles
-- by action_id). This is a deliberate migration-only change: unlike much of the
-- current schema, action_id is NOT self-provisioned at runtime.
--
-- Rollout ordering (expand): apply this migration to a target database BEFORE
-- deploying the code that adds action_id to the Drizzle schema, because full
-- `select().from(tasks)` calls will reference the column. Applying the additive,
-- nullable column first is safe for the currently running (older) code, which
-- never references it.

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "action_id" text;

-- One task per action id. A UNIQUE PARTIAL index enforces uniqueness only for
-- non-null action_id, so legacy rows and non-meeting tasks (action_id IS NULL)
-- remain valid and may coexist in any number. Slice D relies on this to keep a
-- single canonical task per meeting action.
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_action_id_ux"
  ON "tasks" ("action_id")
  WHERE "action_id" IS NOT NULL;

-- Rollback (reverse of the above; drizzle-kit here is forward-only, so the down
-- step is recorded in-file):
--   DROP INDEX IF EXISTS "tasks_action_id_ux";
--   ALTER TABLE "tasks" DROP COLUMN IF EXISTS "action_id";
