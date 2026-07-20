# DB Cutover — making the app the source of truth

Status: **flipped 2026-07-07** (app database is source of truth; see
CLAUDE.md rule 2). This document's original design-phase sections below are
kept for the seed/reconciliation history and are otherwise historical.

Jordan does not consider the cutover a complete replacement of his real
workflow until docs/BACKLOG.md item 15 ("smart chaining": requests understood,
routed to the right internal person when needed, and tracked to closure)
ships. That is the one open, blocking item.

Decision captured 2026-06-22: the app becomes the source of truth; the vault
becomes a seed + export target. Scope: **everything** (CRM identity,
accounts, meetings, notes, series, tasks). Approach: **staged**, never a big
bang.

## Why

The vault markdown was the scaffolding ("the bones"). In practice the
who-is-who / contacts / account-link data cross-pollinated across three places
(roster `memory/context/merit.md`, account notes, and meeting attendees/owners),
so the same person exists as several half-records ("Jordan" vs "Jordan
Francis"). The app already reconciles this at read time on every request. The
cutover makes that reconciliation **durable**: one clean record per person /
account / meeting, owned by the app, edited in the app, and only exported back
to the vault on demand.

This is roadmap **Milestone 2 #6**. It supersedes the current `CLAUDE.md`
guardrail "markdown is truth"; see "Guardrail change" below.

## Principles

1. **The DB is the source of truth.** The vault is seed material on the way in
   and an export artifact on the way out. Nothing the app needs to function
   depends on a live vault read after seeding.
2. **Stop pushing to the vault by default.** Writes go to the DB. A `VAULT_MODE`
   switch (`readonly` | `readwrite`) gates any GitHub write; default `readonly`
   after cutover. A deliberate **export** is the only thing that writes the vault.
3. **One record per real-world thing.** People, accounts, meetings, series, and
   tasks each get a stable id. Aliases and source paths are columns, not
   duplicate rows.
4. **Reversible + inspectable.** Seeding is idempotent and re-runnable; every
   imported row keeps its `sourcePath`/provenance so we can diff against the
   vault and export cleanly.

## Current state we build on

Already in `lib/db/schema.ts`: `webhook_events`, `email_queue`,
`notifications`, `quote_drafts`, `documents`, `app_meta`, and crucially
`vault_tasks` (a parsed task **snapshot** — the cache pattern the cutover
promotes to authoritative). Drizzle + `drizzle.config.ts` are wired; the only
missing prerequisite is `POSTGRES_URL` (PUNCHLIST).

## Target schema (proposed)

New tables. People and contacts are **unified**: a contact is just a person
whose classification is `customer` and who has an `account_id`. This is the
reconciliation win.

```ts
// people — the identity layer (internal team + customer contacts, unified)
people = pgTable("people", {
  id: serial primaryKey,
  fullName: text notNull,              // canonical "First Last"
  classification: text notNull,        // "internal" | "customer" | "unknown"
  accountId: integer references(accounts.id),  // for customer contacts
  title: text, email: text, phone: text,
  isSelf: boolean default false,       // Jordan
  needsReview: boolean default false,  // ambiguous merge to confirm in-app
  sourcePaths: jsonb<string[]>,        // provenance (roster, account note, notes)
  createdAt, updatedAt,
  // unique on lower(fullName)
})

person_aliases = pgTable("person_aliases", {
  id, personId references(people.id) notNull,
  alias: text notNull,                 // "Jordan", "J. Francis", granola label
  // unique on lower(alias)
})

accounts = pgTable("accounts", {
  id: serial primaryKey,
  name: text notNull, slug: text notNull,   // unique slug
  type, region, stage, status, accountNumber: text,
  workstream: text default "merit",
  overview: text,
  sourcePath: text, createdAt, updatedAt,
})

meetings = pgTable("meetings", {
  id: serial primaryKey,
  date: text,                          // YYYY-MM-DD
  title: text notNull,
  accountId: integer references(accounts.id),  // null => internal
  isInternal: boolean default false,
  topic: text, granolaId: text,
  bodyMarkdown: text,                  // the note body (sections)
  sections: jsonb<Record<string,string>>,
  seriesId: integer references(series.id),
  sourcePath: text,                    // original vault path (for export)
  createdAt, updatedAt,
})

meeting_attendees = pgTable("meeting_attendees", {
  meetingId references(meetings.id), personId references(people.id),
  // pk (meetingId, personId)
})

tasks = pgTable("tasks", {            // unifies Jordan's tasks + action items
  id: serial primaryKey,
  meetingId: integer references(meetings.id),
  ownerPersonId: integer references(people.id),
  accountId: integer references(accounts.id),
  text: text notNull, done: boolean default false,
  due: text, priority: text, status: text,
  isJordans: boolean default false,
  description: text, notes: text,
  sourcePath: text, sourceLine: integer,   // for export + legacy linkage
  createdAt, updatedAt,
})

series = pgTable("series", {
  id: serial primaryKey,
  name: text notNull, cadence: text,
  accountId: integer references(accounts.id),
  status: text default "active",
  currentState: text,                  // AI-maintained rolling status
  sourcePath: text, createdAt, updatedAt,
})
// series membership = meetings.seriesId; the "log" derives from member meetings.
```

Existing `documents`, `quote_drafts`, `email_queue`, `notifications` stay and
gain real FKs (`accountId`, `personId`) instead of free-text `account`.

## The hard part: identity reconciliation (seed)

A one-time, re-runnable importer that builds `people` from every source and
dedupes:

1. **Accounts** first (from `300 Merit/Customers/*.md`) → `accounts` rows.
2. **People** from, in priority order: roster internal list (→ internal), roster
   customer contacts (→ customer + account), account-note contacts (→ customer +
   account), then meeting attendees and task owners (→ unknown unless matched).
3. **Dedup** by canonical full name; fold short names/aliases (the `Jordan` →
   `Jordan Francis` collapse) into `person_aliases`. Jordan = `isSelf`, internal.
4. **Ambiguity is surfaced, not guessed.** When a bare first name could be two
   people (two "Mike"s), create/keep separate rows and set `needsReview = true`;
   the app shows a "confirm who this is" queue so you resolve it in-app. This is
   exactly the who-is-who cleanup, done once, durably.
5. **Meetings / tasks / series** import with FKs resolved to the people/accounts
   rows; keep `sourcePath`(+`sourceLine`) for export and traceability.

## Stages (each shippable, reversible)

1. **Schema + seed importer** (behind `POSTGRES_URL`). Seed into the DB; vault
   untouched. Diff report: counts, dedup merges, `needsReview` list.
2. **Dual-read.** Read paths prefer the DB, fall back to vault parse if a row is
   missing. Verify the app looks identical.
3. **DB-source.** Drop the vault-read fallback; the DB is authoritative. The
   in-app "confirm who this is" review queue clears ambiguities.
4. **Stop vault writes.** Set `VAULT_MODE=readonly`; retarget the write paths
   shipped this session (editable person, reclassify, create-account,
   create-series, task checkoff, account/meeting edits) to the DB. Same UI.
5. **Export.** A `POST /api/export` (and/or cron) that renders the DB back to
   vault markdown in the canonical formats, committed in one batch — the
   "final push when ready."

## Write paths to retarget (from this session)

`/api/people/classify`, `/api/meetings/classify` (reclassify + create account),
`/api/series` (create), `/api/tasks/complete`, `/api/accounts/note`,
`/api/meetings/note`. Each keeps its UI; the body writes a DB row instead of a
GitHub commit. The pure transforms (e.g. `setMeetingCustomer`,
`setPersonOverride`) get reused by the **export** renderer instead.

## Guardrail change (CLAUDE.md)

Flip rule 2 from "Markdown is truth … writes back as a git commit" to: "The app
database is the source of truth. The vault is seed-in / export-out only; the app
must run with no live vault dependency. Writes go to the DB; the vault is written
only by the explicit export, gated by `VAULT_MODE`." Keep the workstream-identity
and no-em-dash rules. I'll make this edit when stage 3 lands, not before.

## Email linkage (added 2026-06-24)

Two more tables back "email actions from tasks" (built after the seed): `emails`
(authoritative copy, seeded from `email_queue` + the live pipeline; keeps
`bodyText` so the AI can use the thread as drafting context) and `task_emails`
(many-to-many task ↔ email link). Migration `drizzle/0003`.

## How to run the cutover (operator steps)

Stage 1 (seed) is ready. Run in order:

1. **Provision Postgres.** Vercel dashboard → Storage → Create Database →
   Postgres (Neon). It sets `POSTGRES_URL` in the project env automatically.
2. **Create the tables.** Either `vercel env pull .env.local` then `npm run
   db:push` locally, or run the generated SQL (`drizzle/0002`, `0003`) in the
   Neon query editor. (`db:push` reads `lib/db/schema.ts`.)
3. **Redeploy** so the running app sees `POSTGRES_URL`.
4. **Dry run (no writes).** Open `https://<app>/api/cutover/dry-run`. Review
   `counts`, `aliasMerges`, `needsReview`, and `unresolvedNames` — the who-is-who
   confirmations. Nothing is authoritative yet.
5. **Seed.** `POST https://<app>/api/cutover/apply` with body `{"confirm":true}`
   (e.g. from the browser console or curl with the app's auth cookie). It reloads
   only the cutover tables; re-runnable.
6. Tell me it's seeded — I verify the apply against the live data and proceed to
   Stage 2 (dual-read).

## Needs Jordan

- Set **`POSTGRES_URL`** (Vercel Postgres / Neon) so the schema + seed can run.
- Review the seed **diff/merge report** and the `needsReview` queue (the
  who-is-who confirmations) — that's the one human-in-the-loop step.

## Risks / mitigations

- **Bad merges** → never auto-merge ambiguous names; `needsReview` + in-app
  confirm. Seed is re-runnable.
- **Drift during transition** → dual-read stage validates DB == vault before we
  drop the fallback.
- **Losing the vault as a backup** → the export renderer + `sourcePath` columns
  mean we can always reproduce the markdown.
- **Big-bang risk** → five independently shippable stages, each reversible.
```
