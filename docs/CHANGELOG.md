# Changelog

One line per phase boundary: what shipped and any decisions made.

## Phase 0 — Scaffold + vault on the web

- Next.js (App Router) + TypeScript strict + Tailwind scaffold; builds clean, no type errors.
- `lib/github.ts`: single Octokit client. Reads via Git Trees + Contents API (vault-relative paths, root-prefix owned here), writes via commits with latest-SHA read-before-write, never force-push.
- `lib/vault/`: pure, typed parsers with unit tests against the docs/02 fixtures: frontmatter, tasks (bracket-balance scan handles nested `[[wikilinks]]` inside inline fields), roster (Team Overrides applied last), meetings (dual-capture action items), meetings index, wikilinks. 22 tests pass.
- `/today`: read-only list of open tasks due today or overdue, computed in Mountain Time (`America/Denver`) so it matches Obsidian. Renders title, customer, due, priority, workstream, source file.
- Single-user auth: shared-secret middleware + `/login`. Enabled only when `APP_PASSWORD` is set; otherwise the app is open so Vercel password protection can be used instead.
- Decision: the app is developed at `~/dev/hammer-claw-command-center` because macOS blocks spawned `node`/`next` processes from `~/Documents` (TCC). The repo can live anywhere; this only affects where the working copy sits. See PUNCHLIST.
- Stub/needs-Jordan: `GITHUB_TOKEN` + `VAULT_REPO` to see live data (PUNCHLIST).

## Phase 1 — The email keystone

- Vercel Postgres (Neon) + Drizzle. Tables: `webhook_events`, `email_queue` (unique on messageId for dedupe), `notifications`, plus `vault_tasks` (parsed snapshot), `quote_drafts`, `app_meta`. Migration `drizzle/0000_*.sql` generated; apply with `npm run db:push`.
- `POST /api/webhooks/email` per docs/03: constant-time `X-HC-Signature` check, dedupe on messageId (insert onConflictDoNothing), raw event logged (header secret never stored), enqueue status `new`, log an in-app `new_email` notification.
- `/inbox`: lists the queue, suggests workstream + likely account by recipient identity, sender domain, and roster lookup (deterministic, no AI), and files into the correct workstream `Inbox/` via a GitHub commit (`app: file <from> email <date>`). Sloan/shared have no inbox folder so filing refuses and asks (rule 5). Dismiss archives without filing.
- Vault index sync: `GET /api/cron/sync-vault` (CRON_SECRET-gated) rebuilds the `vault_tasks` snapshot from the live vault; `/today` reads the snapshot when present, else live GitHub. `vercel.json` schedules it every 10 minutes.
- The app degrades gracefully without `POSTGRES_URL`: pages show a setup notice instead of crashing.
- Stub/needs-Jordan: `POSTGRES_URL`, `HC_WEBHOOK_SECRET`, Power Automate Flow A, M365 HTTP-action license check, `ToHC` folder confirm (PUNCHLIST 3 and 4). Every-10-min cron needs a Vercel plan that allows sub-daily cron.
