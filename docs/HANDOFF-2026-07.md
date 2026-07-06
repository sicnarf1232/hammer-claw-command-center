# HANDOFF — Main St. redesign session (2026-07-06)

Written so a fresh session can resume with zero context loss. Exhaustive and
honest: where something is unverified or contradictory, it says so rather than
smoothing it over.

Repo: `~/dev/hammer-claw-command-center` (NOT `~/Documents`, see PUNCHLIST §0).
Live: <https://hammer-claw-command-center.vercel.app> · `git push` to `main`
auto-deploys. Local build passes (`npm run build`). All redesign commits are
pushed (`main` == `origin/main`). The redesign was **not** visually verified on
the live URL this session — only the local production build. First thing to do
next session: open the live site, confirm the Sea Glass theme + Main St. nav
render, and click through Dashboard / Today / Tasks / Contacts / a thread.

---

## 1. CURRENT STATE — what shipped in the Main St. redesign

Source of truth for intent: `DESIGN_HANDOFF.md` (730 lines). Executed "straight
through all 4 phases." Commit range for this session: `a1ddbe9` (Figma
stabilize) → `481a492` (nav logo fix). Squash view: `git log --oneline fd98e9c^..HEAD`.

### Theming / design system (Phase 1, foundation commit `47922ca`)
- **Sea Glass palette**, **Söhne** display face (`public/fonts/Sohne-Buch.woff2`,
  `@font-face` in `globals.css`), **dark default** (`.dark` applied pre-paint in
  `app/layout.tsx`; only an explicit `theme=light` opts out).
- Tokens live twice in `globals.css`: named hex vars (`--accent`, `--surface`,
  …) for bespoke CSS + `--c-*` "R G B" triplets consumed by Tailwind via
  `rgb(var(--c-x) / <alpha-value>)`. `.dark` flips both. `tailwind.config.ts`
  maps them and adds `nav`/`hi` colors, `display` font, radius + sea-glass shadows.
- `.display-title` = Söhne, sentence case, tight tracking. Page `<h1>`s already use it.

### Navigation (`components/Nav.tsx`)
- Two-tier sidebar: PRIMARY (Dashboard, Inbox, Accounts, Meetings) → "Tools"
  separator → SECONDARY (Today, Ask, Tasks, Contacts, Quote, Library) → BOTTOM
  (Branding, Activity, Settings, ThemeToggle).
- Collapse 236px↔64px, persisted `localStorage['nav-collapsed']`, reflows `<main>`
  via `--nav-w` (set pre-paint in layout). Mobile: bottom tab bar + "More" drawer.
- **Brand mark**: uses the transparent icon (`mainst-mark-{light,dark}.png`,
  theme-swapped) + a **type** wordmark "Main St." The packaged
  `mainst-logo-{light,dark}.png` are 1254×1254 **square lockups with an opaque
  background (no alpha)** — unusable as an inline wordmark; they are currently
  **unused** (candidates for a login/splash screen).

### Pages
- **Dashboard** `/dashboard` — NEW default route (`app/page.tsx` redirects here;
  was `/today`). Greeting + floating Ask bar (`components/AskBar.tsx` →
  `/ask?q=` which auto-asks via `AskBrain`), Today's commits + overdue
  `<details>`, inbox snapshot (3 tiles + top-3), accounts-needing-attention,
  right rail (upcoming meetings, recent activity). Loader: `lib/dashboard.ts`.
- **Today** `/today` — two tabs (`components/TodayTabs.tsx`): Focus queue
  (existing `TaskList`) + **Build Your Day** (`components/BuildYourDay.tsx`):
  8am–7pm timeline, greedy "Plan my day" slot-fill, per-task inline scheduling,
  calendar events, now-line, rollover from yesterday.
- **Tasks** `/tasks` — `components/TasksBoard.tsx` toggles Grouped
  (`TasksGrouped.tsx`, new default) / Table (`TasksTable.tsx`, unchanged).
  Grouped = account groups + urgency borders + nudge bar; expandable cards with
  internal-steps checklist + AI **Send update** draft (see AI layer).
- **Contacts** `/contacts` — rebuilt as relationship health
  (`components/ContactsHealth.tsx`, loader `lib/contactsHealth.ts`):
  awaiting-reply / gone-quiet badges, last-touch derived from firehose emails.
- **Inbox thread** `/inbox/[key]` — added participant map strip, cross-customer
  playbook panel (`lib/firehose/playbook.ts`), attach-to-reply (`ReplyBox` +
  `/api/reply` gathers refs), action composer (`ThreadActionComposer.tsx`).
- **Inbox list** `components/InboxList.tsx` — 2-dot state, hover quick-actions,
  unmapped-sender treatment, chip hierarchy.

### Wired vs stubbed (redesign features)
| Feature | Status |
|---|---|
| Dashboard, all sections | **Wired** (reads live vault + firehose + cutover meetings) |
| Build Your Day scheduling / rollover / plan-my-day | **Wired**, persists to `/api/day-plan` (server) + localStorage mirror |
| Build Your Day calendar events | **Stubbed**: `/api/calendar/today` returns `[]` until the "HC Calendar Push" Power Automate flow POSTs to `/api/webhooks/calendar`. Endpoint + webhook built; flow is Jordan-side. |
| Tasks grouped view, urgency, nudge, checklist, Send-update draft | **Wired** (checklist/last-update persist to `task_meta`) |
| Tasks "Mark sent" / in-thread send of a customer update | **Partial**: "Mark sent" records `last_customer_update`; it does NOT actually send. Draft is copy-to-clipboard only. |
| Tasks quick-add (new task) | **Not built** — needs vault task-append writeback (see §2) |
| Contacts health | **Wired**; per-person task counts NOT shown (no person→task link) |
| Thread participant map / playbook / attach-to-reply | **Wired** |
| Action composer "Link to existing task" | **Wired** (writes `task_meta.linked_thread_key`) |
| Action composer "Create new task" | **Not built** — vault writeback (see §2) |

---

## 2. PUNCHLIST RECONCILE

`PUNCHLIST.md` has been rewritten to contain only what is actually open (grouped
by what it blocks). Below is the full reconcile of the previous file + every code
stub. Env-var truth is from `vercel env ls production` (2026-07-06).

**Confirmed SET in Vercel production:** `GITHUB_TOKEN`, `VAULT_REPO`,
`VAULT_BRANCH`, `APP_TIMEZONE`, `APP_PASSWORD`, `POSTGRES_URL` (+ full Neon set),
`BLOB_READ_WRITE_TOKEN` + `BLOB_STORE_ID`, `HC_WEBHOOK_SECRET`,
`ANTHROPIC_API_KEY`, `GRANOLA_API_KEY`, `POWER_AUTOMATE_REPLY_URL`.
**Confirmed NOT set:** `NOTIFY_WEBHOOK_URL`, `ANTHROPIC_MODEL`,
`ANTHROPIC_FAST_MODEL`, `VAULT_ROOT` (correctly blank), `VAULT_MODE` (not
implemented anyway). `CRON_SECRET` did not appear in the list — Vercel injects it
only when cron jobs are configured; treat as **unverified**.

### DONE / obsolete (removed from PUNCHLIST)
- §1 GitHub PAT / VAULT_REPO / VAULT_BRANCH / VAULT_ROOT — all set (PAT rotated 2026-06-29).
- §2 Auth — `APP_PASSWORD` set (rotated 2026-06-30).
- §3 Database — `POSTGRES_URL` live; schema self-provisions (no `db:push` needed).
- §5 Flow B (reply/send) — live, verified 2026-06-16.
- §6 AI drafting — `ANTHROPIC_API_KEY` live.
- §7b price list + quote branding + save-quote — done.
- Milestone 3 Blob provisioning — `BLOB_READ_WRITE_TOKEN` set.
- Milestone 4 firehose build + unified inbox — done; mail is flowing into `/inbox`.
- **Build Your Day day-plan persistence** — DONE this session (`/api/day-plan`);
  the old "localStorage only" note is obsolete.
- **Action composer "link to existing task"** — DONE this session.

### STILL OPEN (carried into rewritten PUNCHLIST)
- **HC Calendar Push** Power Automate flow → `/api/webhooks/calendar` (blocks BYD calendar events).
- **New-task creation** via vault writeback (blocks Tasks quick-add + composer "Create task").
- **Notification push channel**: `NOTIFY_WEBHOOK_URL` unset → notifications in-app only (decision needed).
- **Cron plan**: Hobby allows once/daily; `vercel.json` runs 2 daily crons, full schedule in `vercel.cron-pro.json` (needs Pro). DST guard optional.
- **Sloan sending address** unknown → app refuses to send as `sloan`.
- **Flow A (flagged-email)**: `/api/webhooks/email` exists; whether the Outlook
  flagged-trigger flow is built/pointed at it is **unverified**. Firehose capture
  flows appear live (mail arrives); the flagged path is separate.
- **Quote re-edit**: needs `ALTER TABLE documents ADD COLUMN IF NOT EXISTS spec jsonb;`
  in Neon — **unverified** whether applied. Auto quote-tag still manual.
- **Branding `paper` column**: `ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS paper` — **unverified**.
- **Granola/Cowork**: verify live filing; retire Cowork granola-triage to honor one-writer-per-file.
- **Firehose follow-ons**: Account Emails tab + Contact Emails tab not built. (Brain retrieval over email + post-hoc triage ARE built.)
- **PDF export** (meeting Download PDF via headless Chromium) — verify on live Hobby.

### Code stubs found (grep for TODO/STUB/"coming next"/"not yet")
- `components/ThreadActionComposer.tsx:90` — "new-task creation … coming next" (the create-task gap above). Only real deferred-work marker in code.
- Everything else matching was `placeholder=` attributes or prose ("not yet a series"), not stubs.

---

## 3. DATA LAYER STATUS (`docs/DB-CUTOVER.md`)

**Headline: the cutover is at STAGE 1 only. The app is NOT the source of truth
yet — it still reads the vault live for the core.** `DB-CUTOVER.md` describes the
end state ("the app becomes the source of truth"); that has **not** happened.

### Tables that exist (`lib/db/schema.ts`, all self-provisioning)
Operational: `webhook_events`, `email_queue` (legacy), `notifications`,
`quote_drafts`, `documents`, `app_meta`, `app_settings` (kv), `vault_tasks`
(task snapshot cache), `emails` + `email_participants` + `email_attachments` +
`email_triage` (firehose), `task_emails` (link table), `brand_kits`,
`account_domains`, and **new this session** `task_meta`.
Cutover identity tables: `accounts`, `people`, `person_aliases`, `series`,
`meetings`, `meeting_attendees`, `tasks`.

### Seeded (Stage 1, via `POST /api/cutover/apply {confirm:true}`)
Per this session's run: **51 accounts, 203 people, 155 meetings, 533 tasks**
(Stryker = account id 42). Re-runnable/idempotent. `lib/cutover/apply.ts` calls
`ensureCutoverSchema()` first.

### What actually reads the cutover DB (only these)
- `lib/dashboard.ts` — upcoming meetings (`meetings` + `accounts` join).
- `lib/firehose/map.ts` — `people` lookup to map an email → person/account.
- `app/api/inbox/remap` — `people`.
Nothing else. **Stage 2 (dual-read) was never done.**

### What still reads the VAULT live (GitHub, per request)
- Tasks: `getAllTasks` (Tasks page), `getTodayTasks` (Today/Dashboard). Today
  prefers the `vault_tasks` snapshot table then falls back to a live vault read.
- Accounts: `listAccounts`, `getAccountsWithStats` — vault `300 Merit/Customers/*.md`.
- Contacts: `getContactsHealth` uses vault `account.contacts` for identity
  (emails/last-touch come from the firehose `emails` table).
- Meetings page, roster, series — vault.

### VAULT_MODE
**Design-only. Not implemented.** No `process.env.VAULT_MODE` reference exists.
Writes still go to the vault via GitHub commits (e.g. `/api/tasks/complete`,
account/meeting/person edits). The only DB-only writes are the app-state tables
(triage, task_meta, day-plan/calendar settings, documents, brand_kits, emails).

### Implication for a fresh session
The "markdown is truth" guardrail in CLAUDE.md is **still in force in practice**.
`DB-CUTOVER.md`'s "guardrail change" has NOT been applied. Do not assume the DB
is authoritative for accounts/tasks/meetings — it is a partial, seeded mirror.

---

## 4. AI LAYER MAP

Model helpers (`lib/ai.ts`): `model()` = `ANTHROPIC_MODEL` ?? **`claude-opus-4-8`**;
`fastModel()` = `ANTHROPIC_FAST_MODEL` ?? **`claude-sonnet-5`**. Neither override
env is set, so defaults apply. **No Haiku is actually called** (but see the bug
in §5). Single client in `lib/ai.ts`; every call goes through it.

| Function | File | Model | Purpose | Output auto-stored/sent without human confirm? |
|---|---|---|---|---|
| `draftReply` | lib/ai.ts | Opus 4.8 | Draft an email reply (HTML, Jordan's voice) | **No** — shown in `ReplyBox` to edit, then he sends |
| `draftCustomerUpdate` | lib/ai.ts | Sonnet 5 | Task→customer status update (tone by urgency) | **No** — shown in task card textarea; "Mark sent" only stamps a date, does not send |
| `proposeVoiceProfile` | lib/ai.ts | Opus 4.8 | Infer voice profile from sent mail | **No** — shown in Voice settings to save |
| `triageMeeting` | lib/ai.ts | Sonnet 5 | Classify a Granola meeting → workstream/account | **YES (writes vault)** — files the note into a folder on pull; best-effort, editable |
| `updateSeries` | lib/ai.ts | Sonnet 5 | Maintain a rolling-series "current state" | **YES (writes vault)** — updates the Rolling doc on pull |
| `answerVaultQuestion` | lib/ai.ts | Opus 4.8 | `/ask` brain Q&A | **No** — display only |
| `parseQuoteFreeform` | lib/ai.ts | Sonnet 5 | Freeform text → quote line items | **No** — populates the quote builder for review |
| `triageEmailThread` | lib/ai.ts | Sonnet 5 | Thread summary + pathway + priority + needsReply | **YES (DB)** — auto-written to `email_triage`; drives folders + "needs reply". Advisory/reversible: `TriageBar` overrides latch as manual |
| `generateBrief` | lib/ai.ts | Opus 4.8 | Morning/EOD brief text | **YES (DB)** — stored in `notifications` and delivered |

Callers: `triageEmailThread` ← `lib/firehose/triage.ts`; `triageMeeting` +
`updateSeries` ← `lib/meetingsPull.ts` / `lib/createSeries.ts`;
`proposeVoiceProfile` ← `/api/voice/suggest`; `parseQuoteFreeform` ←
`/api/quote/parse`; `generateBrief` ← `lib/briefs.ts`; `answerVaultQuestion` ←
`/api/ask`; `draftCustomerUpdate` ← `/api/tasks/update-draft`; `draftReply` ←
`/api/reply` + `/api/mail`.

**Net:** the three auto-storing paths are email triage (DB, reversible), and the
Granola pull's meeting-filing + series-update (vault writes, best-effort +
editable). Everything customer-facing (replies, updates) is human-in-the-loop.

---

## 5. KNOWN ISSUES (won't be obvious from reading code)

1. **`email_triage.model` provenance is wrong.** `lib/firehose/triage.ts:119`
   hardcodes the stored `model` column to
   `process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-4-5-20251001"`, but the
   actual triage call (`triageEmailThread`) uses `fastModel()` = Sonnet 5. So the
   column lies (says haiku; really Sonnet). Cosmetic/provenance only, but
   misleading. Fix: write the real model string, or drop the default.
2. **Build Your Day calendar is always empty** until the HC Calendar Push flow
   exists. The timeline shows tasks only; this is expected, not a bug.
3. **Day-plan `Plan my day` and rollover are client-side heuristics.** Rollover
   reads *yesterday's localStorage* (`loadRollover`), not the server plan, so on
   a fresh device rollover won't show until that device has a prior day cached.
   The plan itself is server-persisted; rollover source is the gap.
4. **"Send update" doesn't send.** It drafts + copies + stamps
   `last_customer_update`. There is no in-thread send wired even when a task has a
   `linked_thread_key`. A user could reasonably expect the button to send.
5. **Contacts last-email derivation is heuristic.** `emailSignals` matches a
   contact's email against `from_email` (inbound) and a `to_addrs::text LIKE`
   scan of the last 2000 outbound rows. Contacts without a structured email in
   the vault get no badge. "Gone quiet" = >14 days; "awaiting reply" =
   flagged-inbound OR last-inbound-after-last-outbound. Approximate by design.
6. **Cutover ≠ live source.** (See §3.) Easy to wrongly assume `accounts`/`tasks`
   DB tables back the UI. They don't (except dashboard meetings + firehose people).
7. **`design-reference/`** holds the raw Figma/Vite export (its own
   `package.json`, `index.html`, `vite.config.ts`). It is excluded in
   `tsconfig.json` and must stay excluded — it once clobbered the root
   `package.json` and broke the build (recovered via `git checkout`).
8. **Unused square logo lockups** (`mainst-logo-*.png`, ~1.8MB total) sit in
   `public/logos/` unused after the nav fix. Keep for a splash/login screen or delete.
9. **`?` avatar / "Link account" chip** on unmapped inbox rows links to the
   thread (where linking lives); it is not itself an inline account picker.
10. **Live-deploy visual state unverified this session** (see top of file).

---

## 6. DECISIONS LOG (things that changed or contradict CLAUDE.md / /docs)

1. **Default route moved** `/today` → `/dashboard` (`app/page.tsx`). `docs/04`
   / earlier notes implied Today/Meetings as the landing; update if referenced.
2. **Dark theme is the default** (Main St. brand). Prior UI was light-default.
3. **App SENDS mail, never creates Outlook drafts.** Already captured in
   PUNCHLIST §5 but worth re-stating: `docs/03` language about "create draft" is
   obsolete — Flow B is a direct send; the app UI says "Send reply."
4. **New "app-state in DB, markdown stays truth" pattern for task augmentation.**
   `task_meta` (checklist / linked thread / last-customer-update) is deliberately
   DB-only fast-changing state keyed by the vault task id (`sourceFile:sourceLine`),
   per CLAUDE.md "the DB only holds state that does not belong in version
   control." This is the chosen reconciliation of "markdown is truth" with
   app-managed task metadata — NOT the DB-CUTOVER "DB becomes truth" path.
5. **DB-CUTOVER guardrail flip NOT applied.** `docs/DB-CUTOVER.md` says it
   supersedes CLAUDE.md rule 2 "when stage 3 lands." Stage 3 has not landed, so
   CLAUDE.md rule 2 stands. Do not edit CLAUDE.md rule 2 yet.
6. **No em dashes** honored throughout new copy + AI system prompts (CLAUDE.md
   rule 7) — all new `draftCustomerUpdate` / draft prompts state it explicitly.
7. **Nextech removed** (pre-session, 2026-06-16) — new task views filter
   `workstream !== "nextech"`; new code keeps that filter.
8. **Two new webhooks are auth-exempt** by the existing middleware rule
   (`/api/webhooks/*`): `/api/webhooks/calendar` uses the same
   `HC_WEBHOOK_SECRET` + `x-hc-signature` scheme as the firehose.

---

## Quick file index (new/changed this session)
Pages: `app/dashboard/page.tsx`, `app/today/page.tsx`, `app/tasks/page.tsx`,
`app/contacts/page.tsx`, `app/inbox/[key]/page.tsx`, `app/page.tsx`,
`app/layout.tsx`. Components: `Nav.tsx`, `InboxList.tsx`, `ThemeToggle.tsx`,
`AskBar.tsx`, `BuildYourDay.tsx`, `TodayTabs.tsx`, `TasksBoard.tsx`,
`TasksGrouped.tsx`, `ContactsHealth.tsx`, `ThreadActionComposer.tsx`,
`ReplyBox.tsx`, `AskBrain.tsx`, `icons.tsx`. Libs: `dashboard.ts`,
`contactsHealth.ts`, `taskMeta.ts`, `firehose/playbook.ts`, `ai.ts`
(`draftCustomerUpdate`), `firehose/suggest.ts` (+id). APIs: `/api/day-plan`,
`/api/calendar/today`, `/api/webhooks/calendar`, `/api/tasks/meta`,
`/api/tasks/update-draft`, `/api/inbox/thread-action`. Styling:
`globals.css`, `tailwind.config.ts`. Assets: `public/logos/*`, `public/fonts/Sohne-Buch.woff2`.
