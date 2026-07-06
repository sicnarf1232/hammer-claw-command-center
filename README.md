# Hammer Claw Command Center

A single-user web app that sits on top of Jordan's Obsidian vault. The vault
(a private GitHub repo) is the source of truth; this app is a fast, always-on
layer that reads and writes the same markdown, plus a small Postgres database
for fast-changing state (email queue, notifications, quote drafts).

Read `/docs` (01 to 05) and `CLAUDE.md` before changing anything. Build in phases.

## Stack

Next.js (App Router) + TypeScript strict, Tailwind, Vercel hosting + Cron,
GitHub API (Octokit) for vault read/write, Vercel Postgres (Neon) + Drizzle,
Power Automate flows for Outlook email, Anthropic for AI drafting and briefs.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in at least GITHUB_TOKEN and VAULT_REPO
npm run dev                  # http://localhost:3000  (redirects to /today)
npm test                     # parser unit tests
npm run typecheck            # tsc --noEmit
npm run build                # production build
```

Note: macOS blocks spawned `node`/`next` processes from running inside
`~/Documents` (privacy protection), so keep the working copy outside Documents
(e.g. `~/dev`). See PUNCHLIST.md.

## Layout

- `lib/vault/` — all markdown parsing (pure, unit-tested). UI never parses inline.
- `lib/github.ts` — the only GitHub client.
- `lib/db/` — Drizzle schema + client (Phase 1+).
- `app/` — pages (`/today`, `/inbox`, `/meetings`, `/quote`) and API routes
  (`/api/webhooks/email`, `/api/reply`, `/api/cron/*`).

## What needs Jordan

See `PUNCHLIST.md` for every secret, decision, and Power Automate flow the app
stubs behind an env var or TODO.
