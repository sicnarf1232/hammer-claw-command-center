# CLAUDE.md — Command Center repo guardrails

You are building the Hammer Claw Command Center: a personal command center app that sits on top of Jordan's Obsidian vault. The vault is the source of truth. This app is a fast, always-on layer that reads and writes the same data, plus a small database for fast-changing state.

Read `/docs` before writing code. Build in phases. Do not skip ahead.

## What this app is (and is not)

- It IS a single-user web app for Jordan: task views, an email inbox/triage, meeting notes, and a quote builder, all reading the live vault.
- Default route is `/dashboard` (moved from `/today`, 2026-07-06). Dark theme is the default (Main St. brand); only an explicit `theme=light` opts out.
- It is NOT a multi-tenant SaaS. One user. No signup flow, no orgs, no roles.
- It is NOT a replacement for the vault. Markdown in the vault stays the source of truth. The DB only holds state that does not belong in version control.

## Stack (pinned — do not substitute without asking)

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js (App Router) + TypeScript | |
| UI | Tailwind CSS | Keep it clean and flat. No heavy component libs in Phase 0. |
| Hosting | Vercel | `git push` deploys. Use Vercel Cron for scheduled jobs. |
| Vault access | GitHub API (Octokit) | Read via Contents API, write via commits. No server filesystem. |
| Database | Vercel Postgres (Neon) + Drizzle ORM | **Not added until Phase 1.** Phase 0 has no DB. |
| Auth | Single-user. Vercel password protection OR a shared-secret middleware. | No Clerk/Auth0 unless asked. `/api/webhooks/*` and `/api/cron/*` bypass the password middleware and verify their own secrets (`x-hc-signature`, `CRON_SECRET`). |
| Email | Microsoft Power Automate flows -> app webhooks | App never talks to Graph API directly. Flow B is a direct SEND (verified live 2026-06-16): the app sends mail, it never creates Outlook drafts. docs/03 "create draft" language is obsolete. |

## Hard rules

1. **Match the vault contract exactly.** Task schema, frontmatter, roster, meeting action items, and the meetings index are all specified in `docs/02-vault-contract.md`. Parse to that spec. If a field is ambiguous, ask Jordan, do not guess.
2. **Markdown is truth.** When the app changes vault content, it writes back as a git commit through the GitHub API. Small, atomic commits. Never bulk-rewrite files.
   - Scheduled to be superseded by `docs/DB-CUTOVER.md` stage 4 (`VAULT_MODE`). Do not flip this rule until that lands.
   - App-managed fast-changing task state (checklists, linked threads, last-customer-update) lives in the DB `task_meta` table keyed by the vault task id (`sourceFile:sourceLine`). That is deliberate app-state per this rule's "does not belong in version control" carve-out, not a violation (decision 2026-07-06).
3. **One writer at a time per file.** Obsidian, Cowork schedulers, and this app can all touch the same file. Read latest before writing, commit with a clear message, never force-push.
4. **No secrets in git.** All tokens and the webhook secret live in Vercel env vars. Provide a `.env.example`, never a real `.env`.
5. **Workstream identity is sacred.** The vault is split into workstreams (merit, sloan, personal, shared; nextech was removed 2026-06-16 and task views filter it out). Output that goes anywhere with an identity (an email draft, a filed note) must use the right workstream's folder, email, and brand. See docs/02 section "Workstreams." When in doubt, ask.
6. **Phase order with checkpoints (build straight through).** Build the phases in `docs/04-build-plan.md` in order. At each phase boundary: commit, run that phase's definition of done, and add a one-line entry to `/docs/CHANGELOG.md`. Keep going through Phase 4 in one session. If a phase needs a secret or a decision Jordan has not provided (a Power Automate flow URL, his M365 plan detail, the Outlook folder name, the Vercel env values), stub it cleanly behind an env var or a clearly marked TODO, record it in `/PUNCHLIST.md`, and continue with any later work that does not depend on it. Only stop fully if you are blocked across the board. Never invent a secret or fake a credential.
7. **No em dashes in any user-facing copy or generated content.** Jordan's house style. Use commas, colons, or periods.

## Conventions

- TypeScript strict mode on.
- Server components by default; client components only where interactivity needs them.
- All vault parsing lives in one module (`lib/vault/`) with typed outputs. UI never parses markdown inline.
- All GitHub access goes through one client (`lib/github.ts`).
- Keep functions small and testable. Add a unit test for every parser (task parser, frontmatter parser, roster parser). The parsers are the riskiest code.
- Time and dates: vault uses ISO `YYYY-MM-DD` and Mountain Time. Respect both.

## Definition of done, every phase

- Builds clean, deploys to Vercel, no type errors.
- Parsers have unit tests that pass against the sample fixtures in `docs/02-vault-contract.md`.
- Jordan can see the result at the live URL.
- A short note in `/docs/CHANGELOG.md` of what shipped and any decisions made.

When unsure, ask Jordan a specific question rather than building on an assumption. He prefers a quick question over rework.
