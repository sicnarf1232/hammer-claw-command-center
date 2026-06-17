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

## Live verification + repo

- Created and pushed `sicnarf1232/hammer-claw-command-center` (private).
- Verified the spine against the live vault (using a temporary read token): `/today` rendered Jordan's real open tasks from `100 Periodics/Daily/TASKS.md` dated 2026-06-11; `/meetings` parsed 30 meetings from `Meetings-Index.md`; `/quote` loaded 1144 parts from the price list; `POST /api/quote/pdf` returned a valid Merit OEM PDF.
- Confirmed `VAULT_ROOT` is blank (vault markdown is at the repo root).
- Fix: price-list header matching is now keyword-based so real headers (`Part#`, `High Price`) map correctly (was returning an empty catalog). 25 parser tests pass.

## Deployed to production

- Live at https://hammer-claw-command-center.vercel.app (Vercel project under "jordan's projects"), GitHub-connected so `git push` to main auto-deploys.
- Verified live: logged in through the app password gate and `/today` rendered the real vault tasks as of 2026-06-11 (Phase 0 DoD met on the live URL).
- Production env set: GITHUB_TOKEN, VAULT_REPO, VAULT_BRANCH, APP_TIMEZONE, APP_PASSWORD.
- Two deploy-time fixes: upgraded Next.js to 15.5.19 (Vercel blocks the older version's security advisory; relevant to the auth middleware), and reduced `vercel.json` to two daily crons for the Hobby plan (full schedule preserved in `vercel.cron-pro.json`).
- Follow-ups (PUNCHLIST 8): rotate the GitHub PAT (it was shared in chat), add the database + remaining secrets, restore full crons after a Pro upgrade.

## Phase 1 wiring — webhook keystone live (2026-06-12)

- Neon Postgres store confirmed attached in Vercel (all `POSTGRES_*` vars present; URLs are marked sensitive so they do not pull locally).
- Set `HC_WEBHOOK_SECRET` in production env and redeployed so the webhook stops returning 503.
- Verified the live `POST /api/webhooks/email` end-to-end (docs/03 test plan steps 1-2): 401 on bad signature, 400 on missing messageId, 200 `{ok:true,deduped:false}` on a full payload (the successful insert proves `email_queue` + `webhook_events` + `notifications` tables exist), 200 `{ok:true,deduped:true}` on a repeat (unique-index dedupe). One synthetic test row left in the queue for Jordan to dismiss.
- Confirmed with Jordan: the generic HTTP action is available on his M365 plan, so Flow A uses HTTP (no relay fallback).
- Remaining for a fully lit inbox: Jordan builds Power Automate Flow A (trigger + HTTP POST with the secret) and flags one real email to confirm it lands in `/inbox`.

## Phase 2 wiring — reply send path live (2026-06-16)

- `ANTHROPIC_API_KEY` set in production; "Draft with AI" verified live. (First save was mis-cased `Anthropic_API_Key` and 503'd; env var names are case-sensitive.)
- Decision change: Jordan wants the app to SEND replies directly, not create a draft (the standard Outlook connector has no create-draft action anyway). Flow B is now trigger -> "Send an email (V2)" on the Merit connection, mapping `to`/`subject`/`bodyHtml`. An earlier threaded build (Get emails -> Condition -> Reply/Send) had empty branches and silently sent nothing; simplified to a single send step. Replies go as a fresh "RE:" email, not in-thread.
- Flow B trigger auth: the new Power Platform request trigger defaulted to OAuth-required (`DirectApiAuthorizationRequired`, 401). Switched to the SAS/URL scheme so the app calls it tokenless; `POWER_AUTOMATE_REPLY_URL` set in production.
- UI relabeled to match reality: "Send reply" / "Reply sent" (was "Create Outlook draft").
- Removed the nextech workstream from the app entirely (type, identity table, classification, inbox picker, chip/accent). App now knows merit, sloan, personal, shared. Vault-contract docs still describe the `400 Nextech/` folder; scrubbing those is a separate decision.
- Verified end-to-end: a self-addressed test email -> app "Send reply" -> delivered to the Merit inbox.

## Fix — GitHub rate-limit blowout (2026-06-16)

- Symptom: the live app returned "API rate limit exceeded for user ID ..." (the authenticated 5,000/hour GitHub limit). Root cause: `getAllTasks` reads every markdown file in the vault as an individual blob call (~979 of 1058 files), and every page had `revalidate = 0`, so each `/today` or `/tasks` view cost ~981 GitHub calls. Roughly five page loads exhausted the hourly budget.
- Fix in `lib/github.ts`: cache blob reads by SHA (content-addressed, so immutable) in the Next Data Cache with `revalidate: false`; a changed file arrives under a new SHA and misses naturally. The branch+recursive-tree listing is cached 60s behind `vault-tree`, and `writeFile` calls `revalidateTag('vault-tree')` so commits (task complete, account number) show immediately. After warm-up a full-vault render costs ~2 GitHub calls instead of ~981. `getFile` (read-by-path, used before write-back) stays uncached for write correctness.
- Verified: typecheck clean, 28 parser tests pass, production `next build` clean.

## Feature — Granola pull (Path A: in-app button) (2026-06-17)

- New "Pull from Granola" button on `/meetings` (and the now-live `granola-pull` cron) pulls recent Granola meetings into the vault in one press. Shared implementation in `lib/meetingsPull.ts`.
- `lib/granola.ts`: single Granola public-API client (`https://public-api.granola.ai`, Bearer `GRANOLA_API_KEY`). `listNotesCreatedAfter` (cursor pagination, page_size 30) + `getNote`. Window self-adjusts: pulls notes created after the newest date already in `Meetings-Index.md` (last 30 days on an empty index).
- AI triage (`triageMeeting` in `lib/ai.ts`): each note's title, attendees (classified merit/customer via the roster), Granola folders, and summary plus the known-account list go to Claude, which returns workstream + account + bucket + a structured TL;DR / Notes / Decisions / dual-capture action items. Jordan's action items get the inline field row so they surface as real tasks; others stay tracking-only.
- `lib/meetingFormat.ts` (pure, unit-tested): renders the docs/02 meeting note (frontmatter incl. `granola_id` + `source: granola-pull`), computes the `<workstream>/Meetings/<Account>/YYYY-MM-DD - Title.md` path (unknown account stages under `300 Merit/Meetings/_Unfiled`), and upserts the index table newest-first, deduped by basename, capped at 30. Dedup across the vault is by basename against the SHA-cached file tree, so re-pulls are safe.
- Route `POST /api/meetings/pull` (behind the app password gate, `maxDuration` 300) and the cron both 503/skip cleanly without `GRANOLA_API_KEY` or `ANTHROPIC_API_KEY`. 11 new mapper tests (39 total). Typecheck + production build clean.
- Needs Jordan: confirm `GRANOLA_API_KEY` is set in Vercel (done), then press the button on the live `/meetings` and spot-check filing. Triage filing is best-effort and editable in the vault.

## Polish — canonical meeting format (Meeting Notes App Handoff) (2026-06-17)

- Adopted Jordan's refined meeting-note format from the "Meeting Notes App Handoff" spec for both the Granola pull output and the `/meetings` viewer. Sections, in order: TL;DR, Action Items, Key Decisions, Numbers That Matter, Watch-Outs, Full Notes (with `###` subsections). Optional sections are omitted when empty; TL;DR and Action Items always render. Added a `**Topic:**` meta line (+ `topic` frontmatter, now parsed and shown).
- `triageMeeting` now returns the full structured shape (topic, tldr, actionItems, decisions, numbers, watchouts, fullNotes[{subsection,text}]) instead of a flat notes blob, so meetings come in already organized.
- Fixed a latent bug: the viewer looked for a `Decisions` section, but real notes (and the spec) use `Key Decisions`, so decisions never rendered. The viewer now renders the canonical set, with subsection-aware Full Notes. Title H1 carries a ` - <Account>` suffix (plain hyphen, house style).
- Kept dual-capture action items (Jordan's items keep the `[due:: ]` field row that feeds /today and /tasks); others now also get a plain indented `Due:` line per the spec. 40 tests pass (4 new), typecheck + build clean.
- Not yet built from the handoff (proposed follow-ons): rolling-series notes (Current State + Meeting Log), the by-customer and hub views, and the config-driven taxonomy/series/people surface.

## Feature — rolling-series notes (2026-06-17)

- Rolling-series notes per the handoff spec (SPEC section 5): a living doc per recurring meeting with a pinned Current State and a reverse-chronological Meeting Log. Series docs live at `<workstream>/Meetings/_Series/<id>.md` and carry their own `matchRules` in frontmatter, so the doc is the config: drop one in and the pull maintains it. No separate config file needed.
- `lib/vault/series.ts` (pure, 9 unit tests): `parseSeriesDoc` (incl. nested `matchRules`/`participants`), `matchesSeries` (conservative, SPEC section 5: a clear title signal matches; an attendee-only signal requires a tight participant set so a group meeting that merely includes the person is not mistaken for their 1:1), and `applyMeetingToSeries` (prepend the log entry, rewrite Current State, stamp `updated`, preserve frontmatter verbatim).
- Pull integration (`lib/meetingsPull.ts`): each filed meeting is matched against the vault's series docs; on a match the note's `series` is set, then `updateSeries` (AI, in `lib/ai.ts`) produces 3-5 log bullets and a rewritten Current State (carry forward open threads, retire resolved, no action-item restatement), and the series doc is committed. In-pull updates stack (a second matching meeting builds on the first). Surfaced in the pull result and the button UI.
- Rolling-series view on `/meetings`: a "Rolling series" chip row links to a series detail (Current State pinned, then the Meeting Log). `getSeriesList` / `getSeriesByPath` added to the vault module.
- 49 tests pass (9 new), typecheck + build clean. To activate a series, add one `_Series/<id>.md` doc with `matchRules` (a template is in the handoff sample).

## Realign — match the real vault conventions (2026-06-17)

- Discovery: Jordan's live vault already runs a Granola->vault pipeline (Cowork triage) producing the canonical format, with rolling-series docs at `<...>/Meetings/.../Rolling/` (not `_Series/`), frontmatter `type: Rolling Series` + `series` name + `participants` + `tags` (no `matchRules`), and meeting notes using a `**Bucket:**` meta line, ` -- ` separators, and plain `- [ ] Owner: task` action items with `🗓️ Due:` lines (no dual-capture). Decision: the app becomes the single pipeline and replaces Cowork; realign the code to these exact conventions.
- Series: `SERIES_DIR_MARKER` is now `/Rolling/`. `parseSeriesDoc` reads the `series` field as the name and derives `matchRules` from participants + a 1:1 name when none are present, so existing docs match with zero edits. `applyMeetingToSeries` is now surgical: it replaces only the Current State block and prepends the log entry (em-dash `### MM/DD — Title` heading to match), preserving the H1, frontmatter, and existing entries byte-for-byte; only `updated` is restamped.
- Meeting render: title `Title -- Account`, a `**Bucket:** <bucket> · <topic>` meta line, plain action items with `🗓️ Due:`, and frontmatter trimmed to the vault's set (no `topic`/`source`/`granola_url`). The meeting parser now reads the topic from the Bucket/Topic body line. Dedup stays by date+title basename, which bridges the old UUID `granola_id` and the new `not_` API ids.
- 52 tests pass (incl. a real-vault-shape series doc with derived matchRules), typecheck + build clean.
- Operational (Jordan): to avoid two writers on the same files, retire the Cowork Granola-triage scheduler once the app pull is trusted (PUNCHLIST). The app and Cowork both write meeting notes, `Meetings-Index.md`, and the rolling docs.

## Feature — meetings Hub + dedup hardening (2026-06-17)

- Pull window is now exclusive of the newest indexed day (`isoStartOfDayAfter`, with a Mountain-Time cushion), so re-pulls can never re-fetch a day already filed and cannot recreate duplicates even when an existing note carries a different title or id (the transition-from-Cowork failure mode). Trade-off: no intra-day incremental pull, which fits the daily EOD workflow.
- `/meetings` is now a Hub (`components/MeetingsHub.tsx`): a view toggle (By date / By month / By customer), client-side search across title/bucket/date, a freshness line (count + newest date), and meeting-type labels (Customer · <Account> vs Internal). Runs entirely off the index rows, no extra vault reads. Rolling-series chips and the meeting/series detail views are unchanged.
- Not yet built from the handoff Hub spec (need per-note reads): attendee bubbles colored by team and the cross-meeting action-item rollup.
