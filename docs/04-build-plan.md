# 04 — Phased Build Plan

Build the phases in order. Each has a definition of done (DoD). Commit and run the DoD at each phase boundary, then continue. When Jordan has said to build straight through (the default for the kickoff prompt), proceed phase to phase in one session. Pause only when a phase needs a secret or decision he has not provided: stub it behind an env var or a marked TODO, note it in `/PUNCHLIST.md`, and move on to later work that does not depend on it.

## Phase 0 — Scaffold + vault on the web (half a day)

**Goal:** prove the spine. A deployed Next.js app that renders one read-only task list from the live vault.

Steps:
1. `create-next-app` with TypeScript + Tailwind + App Router. Push to the private repo.
2. Connect the repo to Vercel. Confirm `git push` deploys to a live URL.
3. Add `lib/github.ts` (Octokit client, reads via Contents/Trees API) and `lib/vault/` (frontmatter parser + task parser per docs/02).
4. Build a `/today` page: read tasks from the vault (start with `200 Dashboards/` scope or the Customers/ + Meetings/ folders), filter to open tasks due today or overdue, render title + customer + due + priority. Read-only.
5. Add unit tests for the parsers against the docs/02 fixtures.
6. Put the app behind single-user auth (Vercel password protection is fine for now).

**Definition of done:**
- Live Vercel URL shows Jordan's real open tasks, pulled from the vault, matching what Obsidian shows.
- Parser tests pass.
- No DB yet. No write-back yet.

## Phase 1 — The email keystone (1 to 2 days)

**Goal:** kill the manual email drag/drop.

Steps:
1. Add Vercel Postgres + Drizzle. Tables: `webhook_events`, `email_queue`, `notifications`.
2. Build `POST /api/webhooks/email` per docs/03 (verify signature, dedupe, log, enqueue).
3. Build Power Automate Flow A (flag a folder -> POST). Confirm test email lands.
4. Build `/inbox`: list `email_queue`, classify by sender/subject into workstream + likely account, let Jordan file into the right vault `Inbox/` with a button (write-back via GitHub commit).
5. Add the vault index sync: a cron that parses the vault into Postgres so the UI reads fast. Vault stays truth.

**Definition of done:**
- Jordan flags an email in Outlook and it appears in `/inbox` within a minute, with no drag/drop.
- Filing an email writes a note into the correct workstream `Inbox/` as a git commit.

## Phase 2 — Reply + draft (1 day)

**Goal:** handle email without leaving the command center.

Steps:
1. Build Power Automate Flow B (HTTP trigger -> create Outlook draft as Jordan).
2. Add a "Reply" action in `/inbox`: optional AI-drafted body, Jordan edits, app POSTs `create_draft` to Flow B.
3. Default to `create_draft`. No auto-send.

**Definition of done:**
- Clicking Reply in the app produces a ready draft in Jordan's real Outlook, correct from-identity and signature for the workstream.

## Phase 3 — Meetings + quotes as real pages (2 to 3 days)

**Goal:** retire the sandboxed artifacts and their snapshot bridge.

Steps:
1. `/meetings`: read `100 Periodics/Meetings-Index.md`, resolve notes, render meetings with attendees colored Merit vs customer (roster per docs/02), and the dual-capture action items. This replaces the `meeting-notes-hub` artifact + snapshot script.
2. `/quote`: read the Merit price list (`300 Merit/Price List/`), let Jordan assemble line items (Part #, description, cost), render the Merit OEM branded PDF server-side. This replaces the quote-builder artifact.

**Definition of done:**
- `/meetings` matches or beats the old artifact, reading the vault live (no snapshot).
- `/quote` produces a correct Merit OEM branded PDF from real price-list data.

## Phase 4 — Cron + notifications (1 to 2 days)

**Goal:** it runs without Jordan, and it tells him things.

Steps:
1. Move morning brief, EOD recap, weekly review to Vercel Cron jobs that call AI server-side and write briefs to the vault. (Crons are MT-aware; Vercel Cron runs UTC, so convert.)
2. Granola pull on cron, straight to the vault (replaces the Cowork MCP hop).
3. Notifications: "N tasks due today," "new flagged email," to phone or email. Log to the `notifications` table.

**Definition of done:**
- The three briefs run on schedule with no desktop session.
- Jordan gets a daily "due today" notification and a "new flagged email" notification.

After Phase 4, the working app is real and the desktop-takeover era is over. Stop at any phase and Jordan is still better off than today.

## Environment and secrets

Provide a `.env.example`. Real values go in Vercel env vars only.

```
# GitHub (vault access) — account is sicnarf1232
GITHUB_TOKEN=           # fine-grained PAT on sicnarf1232, scoped to the vault repo only, contents read+write
VAULT_REPO=             # sicnarf1232/hammer-claw-vault
VAULT_BRANCH=main

# Webhook auth
HC_WEBHOOK_SECRET=      # shared secret, checked on POST /api/webhooks/email

# Power Automate
POWER_AUTOMATE_REPLY_URL=   # Flow B HTTP-trigger URL (contains SAS token, treat as secret)

# Database (Phase 1+)
POSTGRES_URL=

# Auth (single user)
APP_PASSWORD=           # or use Vercel password protection instead

# AI (Phase 2+ drafting, Phase 4 briefs)
ANTHROPIC_API_KEY=
```

## Pre-build checklist for Jordan

- [ ] Push the vault to a private GitHub repo under `sicnarf1232`. Note the `owner/repo`.
- [ ] Create a fine-grained GitHub PAT on `sicnarf1232` scoped to that repo only, contents read+write.
- [ ] Create a Vercel account/project, connect the app repo.
- [ ] Confirm in Power Automate which Outlook actions and the HTTP action are available on the M365 plan (see docs/03 license note).
- [ ] Decide the Outlook folder name for the flag-trigger (default `ToHC`).

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Power Automate HTTP action gated on plan | Use the relay fallback in docs/03. Confirm before Phase 1. |
| Vault write conflicts (app vs Obsidian vs Cowork) | Read latest SHA before write, small atomic commits, never force-push. |
| Slow GitHub reads at scale | Phase 1 syncs a parsed index into Postgres; UI reads Postgres. |
| Merit data leaving the tenant | App is personally owned. Decide deliberately what Merit content it touches and where hosted. Keep flows reviewable. Same discipline as the Sloan boundary. |
| Scope creep | Phases are shippable alone. Stop at any phase. |
