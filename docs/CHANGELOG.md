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

## Phase 2 — Reply + draft

- `lib/ai.ts`: Anthropic SDK (`@anthropic-ai/sdk`), default model `claude-opus-4-8` (override via `ANTHROPIC_MODEL`). Drafts reply bodies and (Phase 4) briefs. House-style guarded: prompt forbids em dashes and inventing facts, plus a post-process that strips any em dash. Optional: without `ANTHROPIC_API_KEY` the app skips AI and Jordan writes the body.
- `lib/powerAutomate.ts` + `POST /api/reply`: two modes. `generate` returns an AI draft for Jordan to edit; `draft` posts a `create_draft` intent to Flow B (`POWER_AUTOMATE_REPLY_URL`) to create an Outlook draft as Jordan. Auto-send is not exposed: the app only ever creates drafts. From-identity comes from the chosen workstream; sloan/personal/shared have no sending address so drafting refuses and asks (rule 5).
- `/inbox` Reply panel: optional AI instructions, Draft with AI, editable body, Create Outlook draft. Signature block built per workstream identity.
- Decision: per the claude-api guidance, defaulted the model to `claude-opus-4-8` (was sonnet in the first env template).
- Stub/needs-Jordan: `ANTHROPIC_API_KEY`, Power Automate Flow B + `POWER_AUTOMATE_REPLY_URL`, Sloan from-address (PUNCHLIST 5 and 6).

## Phase 3 — Meetings + quotes

- `/meetings`: reads `100 Periodics/Meetings-Index.md` (the single source of truth), resolves each `[[basename]]` to a file under the Meetings folders, and renders a meeting with attendees colored Merit vs customer from the roster, plus dual-capture action items (Jordan's items show priority/customer/due; others render as tracking only). Live from the vault, no snapshot.
- `/quote`: parses the Merit price list (`300 Merit/Price List/`) into a catalog (tolerant markdown-table parser, unit-tested), lets Jordan assemble line items with part-number autocomplete and manual entry, and downloads a Merit OEM branded PDF rendered server-side with `pdf-lib` (`POST /api/quote/pdf`). No em dashes in the PDF text.
- 24 parser tests pass (added price-list parser tests).
- Decision: the price-list schema is not pinned in docs/02. The parser reads any markdown table and maps Part/Description/Cost columns by header name; if the real format differs, it is the one place to tighten. Flagged in PUNCHLIST.
- Open question for Jordan: confirm the price-list file format and whether a Merit logo asset should be embedded in the PDF (PUNCHLIST).

## Phase 4 — Cron + notifications

- Vercel Cron (`vercel.json`): morning brief (12:30 UTC), notify (13:00 UTC), EOD recap (23:30 UTC), weekly review (Fri 22:00 UTC), Granola pull (every 4h), vault sync (every 10 min). Times target Mountain Daylight Time; brief content always uses `America/Denver` dates.
- `lib/briefs.ts`: assembles a context blob from the live vault (due/overdue tasks, top open tasks, today's meetings), generates the brief via AI when `ANTHROPIC_API_KEY` is set, otherwise writes a deterministic vault-snapshot fallback so briefs still run. Writes to `100 Periodics/Daily|Weekly/` as a git commit and logs a notification. All cron routes are `CRON_SECRET`-gated.
- `lib/notify.ts` + `/notifications` (Activity): every notification is logged to Postgres; the notify cron creates an idempotent daily "N tasks due today" and delivers unsent notifications (including the new-flagged-email ones logged on webhook) to `NOTIFY_WEBHOOK_URL` if set, else in-app only.
- Granola pull is stubbed behind `GRANOLA_API_KEY` pending the endpoint contract: no-op when unset, logs a clear "not implemented" notice when set.
- Stub/needs-Jordan: `NOTIFY_WEBHOOK_URL` (external push channel), `GRANOLA_API_KEY` + endpoint contract, Vercel plan for sub-daily cron, DST handling (PUNCHLIST 7).
