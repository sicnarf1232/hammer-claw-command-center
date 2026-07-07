# PUNCHLIST — things that still need Jordan

Reconciled 2026-07-06 during Phase 1 (stabilize). Only genuinely-open items.
History lives in `docs/CHANGELOG.md` and `docs/HANDOFF-2026-07.md`.

## Needs Jordan, in priority order

1. **Set `CRON_SECRET` in Vercel** (any random string; Vercel sends it as the
   Bearer token on cron calls). Verified 2026-07-06: it is NOT set, and
   `isAuthorizedCron` fails closed, so the two scheduled crons (morning-brief,
   notify) have never run. One env var turns them on.
2. **Build the "HC Calendar Push" Power Automate flow** (blocks the Build Your
   Day calendar timeline). Trigger = recurrence (e.g. every 30 min) or Outlook
   event trigger. Action = Graph `GET /me/calendarView` for today's range,
   Select into `[{id,title,startISO,endISO,location}]`, HTTP POST to
   `https://hammer-claw-command-center.vercel.app/api/webhooks/calendar` with
   header `x-hc-signature: <HC_WEBHOOK_SECRET>` and body
   `{"date":"YYYY-MM-DD","events":[...]}`. The webhook + `GET
   /api/calendar/today` are built and cache under settings `calendar:<date>`.
3. **Pick a notification push channel.** `NOTIFY_WEBHOOK_URL` is unset, so
   notifications are in-app only (`/notifications`). Provide a Power Automate
   "push"/email-to-self flow URL to also push them out.
4. **Vercel plan decision for sub-daily crons.** Hobby = once daily.
   `vercel.cron-pro.json` holds the full schedule (10-min vault sync, EOD
   recap, weekly review, Granola pull every 4h; the Granola pull is now
   staging-only, so running it on cron is safe). Copy its `crons` array into
   `vercel.json` after upgrading to Pro. Note: Phase 2 retires the vault sync.
5. **Sloan sending address.** Unknown, so the app refuses to send as `sloan`
   (`canDraftAs`). Provide the from-address to enable it. Merit sending is
   live.
6. **Retire the Cowork granola-triage step.** The app now stages Granola
   meetings as proposals you approve on /meetings; once you confirm that flow
   works end to end, turn off Cowork's granola triage so two systems do not
   both write meeting notes / index / rolling docs (one-writer rule).
7. **Run the Phase 0 verification** (`docs/VERIFY-LIVE.md`): open
   `/api/debug/schema`, paste the JSON back, and do the 5-minute visual pass.
   Needed before Phase 2 (DB cutover) starts.

## Verify-live (should work; not yet confirmed on production)

- **Main St. redesign visuals** and the rest of `docs/VERIFY-LIVE.md`.
- **Flagged-email Flow A**: `/api/webhooks/email` exists; whether the Outlook
  flagged-trigger flow is built and pointed at it is unverified (firehose
  capture flows are live; the flagged path is separate).
- **Meeting PDF export** on the live Hobby plan (falls back to print view if
  the function is too big; report which you get).

## Resolved / superseded (for the record)

- ~~`documents.spec` manual ALTER~~ — self-provisioned by `lib/documents.ts`
  as of Phase 1 (plus `/api/debug/schema` reports it).
- ~~`brand_kits.paper` manual ALTER / brand-kits.sql~~ — `lib/branding.ts`
  self-provisions the table + column as of Phase 1.
- ~~Vault task-append writeback decision~~ — superseded: task creation lands
  DB-first in Phase 2 (tasks quick-add + thread "Create task"), per the
  approved cutover plan. No vault append will be built.
- ~~In-thread send of a task's customer update~~ — shipped in Phase 1
  (`/api/tasks/send-update`); requires the task to be linked to a thread.
- ~~Granola pull writes without review~~ — replaced by the proposal queue on
  /meetings (Phase 1). Nothing AI-staged reaches the vault without approval.
