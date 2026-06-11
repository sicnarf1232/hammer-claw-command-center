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
