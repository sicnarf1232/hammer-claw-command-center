# Slice B migration rollout: `tasks.action_id`

`drizzle/0010_meeting_action_identity.sql` adds a nullable `tasks.action_id`
column and the `tasks_action_id_ux` unique partial index. This repo has no
Drizzle migration journal and does not apply `drizzle/*.sql` automatically, so
the migration is applied explicitly with the operator command below.

## The command

```
# Point POSTGRES_URL at the target database, then:
npm run db:migrate -- drizzle/0010_meeting_action_identity.sql

# Preview what it would run without touching any database:
node scripts/apply-migration.mts drizzle/0010_meeting_action_identity.sql --dry-run
```

`scripts/apply-migration.mts` reads `POSTGRES_URL` from the environment, else
from `.env.local`, and applies each statement through the neon HTTP driver
(`@neondatabase/serverless`, an existing direct dependency; no WebSocket driver
or other undeclared dependency is required). Statements use `IF NOT EXISTS`, so a
repeat run is a safe no-op (idempotent).

Verify with the focused, read-only checker (column exists; `tasks_action_id_ux`
exists, is UNIQUE, and is PARTIAL on `action_id IS NOT NULL`):

```
node scripts/verify-migration-0010.mts     # POSTGRES_URL = target database
```

## Why ordering matters (expand migration)

Adding `action_id` to the Drizzle schema means full `select().from(tasks)` calls
(e.g. `lib/tasksDb.ts`, `lib/cutover/apply.ts`, the task-reading API routes) will
reference the column. The additive, nullable column must therefore exist in the
database BEFORE the code that knows about it is deployed. Because the column is
nullable and the currently-running (older) code never references it, applying it
early is safe for production while the old code is still live.

## Preview verification (do this first; do NOT touch production Neon)

1. Create an isolated Neon PREVIEW branch of the app database (Neon console or
   `neonctl branches create`). Do not use the production branch.
2. Export that branch's connection string as `POSTGRES_URL` (or put it in
   `.env.local`).
3. Dry-run, then apply:
   ```
   node scripts/apply-migration.mts drizzle/0010_meeting_action_identity.sql --dry-run
   npm run db:migrate -- drizzle/0010_meeting_action_identity.sql
   ```
4. Verify the column and unique partial index (this performs the four explicit
   checks: column present, index present, UNIQUE, PARTIAL on `action_id IS NOT
   NULL`):
   ```
   node scripts/verify-migration-0010.mts   # POSTGRES_URL = preview branch
   node scripts/check-live-schema.mts        # optional: full-schema diff
   ```
5. Deploy this branch to a Vercel PREVIEW bound to the preview Neon branch and
   exercise a task-reading route end to end, e.g.:
   - `GET /api/tasks` (or open `/tasks`) — confirms a full task read still works
     with the new column present.
   - `GET /api/debug/schema` — confirms `tasks.action_id` and
     `tasks_action_id_ux` are present.
6. Confirm the unique partial index rejects a duplicate non-null `action_id`
   while allowing multiple NULLs (spot check in the preview branch only).

## Production sequence

Run in this order; each step must succeed before the next:

1. Apply the migration to the PRODUCTION Neon branch and verify it, BEFORE the
   `main` deployment of this code begins:
   ```
   # POSTGRES_URL = production
   node scripts/apply-migration.mts drizzle/0010_meeting_action_identity.sql --dry-run
   npm run db:migrate -- drizzle/0010_meeting_action_identity.sql
   node scripts/verify-migration-0010.mts
   ```
2. Only after the column and index are confirmed present in production, merge and
   deploy `main`.
3. Post-deploy smoke check: load `/tasks` and `GET /api/debug/schema` in
   production.

## Rollback

Reverse of the migration (also recorded in the SQL file):

```
DROP INDEX IF EXISTS "tasks_action_id_ux";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "action_id";
```

Because Slice B writes no `action_id` values, dropping the column loses no data.
Roll the code back first (or together), since the reverted schema no longer has
the column the deployed code selects.

## Status in this environment

The applier is verified by `--dry-run` (parses to the two expected statements;
see the SQL file). Executing against a live preview Neon branch and the
preview-route check in steps 3-6 could NOT be performed from this local
environment: no preview-branch URL is available here and the Neon API key needed
to create one is not present (Sensitive Vercel env vars pull blank locally). Those
steps must be run by an operator with a preview branch, per the sequence above,
before the production migration and the `main` deployment.
