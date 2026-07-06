# PUNCHLIST — things that still need Jordan

Only genuinely-open items, grouped by what they unblock. Reconciled 2026-07-06
against `vercel env ls` and the code. History of completed items lives in
`docs/CHANGELOG.md` and `docs/HANDOFF-2026-07.md`. Nothing here is invented.

Env vars CONFIRMED set in Vercel production: `GITHUB_TOKEN`, `VAULT_REPO`,
`VAULT_BRANCH`, `APP_TIMEZONE`, `APP_PASSWORD`, `POSTGRES_URL` (+Neon set),
`BLOB_READ_WRITE_TOKEN`, `HC_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`,
`GRANOLA_API_KEY`, `POWER_AUTOMATE_REPLY_URL`.

---

## 0. FYI — build location (not a blocker)

Working copy is `~/dev/hammer-claw-command-center`, not `~/Documents` (macOS TCC
blocks spawned node/npm/next inside `~/Documents`). Code is identical anywhere.

---

## Blocks: Build Your Day calendar timeline

- [ ] **Build "HC Calendar Push" Power Automate flow.** The app never calls
      Microsoft Graph directly (CLAUDE.md). Trigger = recurrence (e.g. every
      30 min) or Outlook event trigger. Action = Graph `GET /me/calendarView`
      for today's range → Select into `[{id,title,startISO,endISO,location}]` →
      HTTP POST to
      `https://hammer-claw-command-center.vercel.app/api/webhooks/calendar`
      with header `x-hc-signature: <HC_WEBHOOK_SECRET>` and body
      `{"date":"YYYY-MM-DD","events":[…]}`. The webhook + `GET /api/calendar/today`
      are built and cache under settings `calendar:<date>`. Until the flow runs,
      the timeline shows tasks only (no meetings).

## Blocks: creating tasks from the app (Tasks quick-add + thread "Create task")

- [ ] **Add a vault task-append writeback.** No `createTask`/`appendTask` exists
      in `lib/writeback.ts`. Needed for (a) the grouped-Tasks quick-add row and
      (b) `ThreadActionComposer`'s "Create task" (its "Link to existing" already
      works via `task_meta.linked_thread_key`). Decision needed: which vault file
      a new task appends to (daily `100 Periodics/Daily/TASKS.md`, or the
      customer note?). "Markdown is truth" still holds, so this must commit to
      the vault, not just the DB.

## Blocks: notifications reaching your phone/email

- [ ] **Pick a notification push channel.** `NOTIFY_WEBHOOK_URL` is unset, so
      notifications are logged in-app only (`/notifications`). Provide a Power
      Automate "push"/email-to-self flow URL to also push them out.

## Blocks: sub-daily crons + sending as Sloan

- [ ] **Vercel plan for cron.** Hobby = once/day. `vercel.json` runs 2 daily
      crons (morning-brief, notify). Full schedule (10-min vault sync, EOD recap,
      weekly review, Granola pull every 4h) is in `vercel.cron-pro.json` — copy
      its `crons` array into `vercel.json` after upgrading to Pro. Optional:
      DST-aware guard (crons fire in UTC; brief *content* is always correct).
- [ ] **Sloan sending address.** Unknown → the app refuses to send as `sloan`.
      Provide the from-address to enable it. (Merit sending is live.)

## Verify-live (should work; not yet confirmed on production)

- [ ] **Main St. redesign on the live URL** — open the site, confirm Sea Glass +
      dark theme + the new nav mark render, click through Dashboard / Today (both
      tabs) / Tasks (both views) / Contacts / an inbox thread.
- [ ] **Flagged-email Flow A** — `/api/webhooks/email` exists; confirm the
      Outlook flagged-trigger flow is built and pointed at it (firehose capture
      flows appear live; the flagged path is separate and unverified).
- [ ] **Granola pull** — press "Pull from Granola" on `/meetings`, confirm
      meetings file into the right account folders and a matching rolling doc
      updates. Then **retire the Cowork granola-triage** step so two systems do
      not both write meeting notes / index / rolling docs (one-writer rule).
- [ ] **Meeting PDF export** — click Download PDF on a meeting; confirm headless
      Chromium renders on Hobby (auto-falls back to print view if the function is
      too big — tell me and I'll switch to chromium-min).

## Optional Neon SQL (features degrade gracefully without them)

- [ ] **Quote re-edit:** `ALTER TABLE documents ADD COLUMN IF NOT EXISTS spec jsonb;`
      then Save a quote once. Until then Recent-quotes is view-only (PDF link).
- [ ] **Branding paper color:** re-run `drizzle/brand-kits.sql` (idempotent
      `ADD COLUMN IF NOT EXISTS "paper"`). Until then `/branding` shows a notice.
- [ ] **Firehose clean record (optional):** run `drizzle/0005_email_firehose.sql`.
      Not required — the schema self-provisions.

## Not-yet-built follow-ons (say the word)

- [ ] **Account Emails tab + Contact Emails tab** (firehose sequence F). Brain
      retrieval over email/attachment text and post-hoc triage ARE built.
- [ ] **In-thread send of a task's customer update.** "Send update" currently
      drafts + copies + stamps `last_customer_update`; it does not send even when
      the task has a `linked_thread_key`.
- [ ] **Auto quote-tag** (`quote_short` from line-item category mix) — needs a
      category field on price-list items; manual until then.
