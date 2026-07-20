# PUNCHLIST — things that still need Jordan

Reconciled 2026-07-20. Only genuinely-open items.
History lives in `docs/CHANGELOG.md` and `docs/HANDOFF-2026-07.md`.

## Needs Jordan, in priority order

1. **Build the "HC Calendar Push" Power Automate flow** (blocks the Build Your
   Day calendar timeline). Trigger = recurrence (e.g. every 30 min) or Outlook
   event trigger. Action = Graph `GET /me/calendarView` for today's range,
   Select into `[{id,title,startISO,endISO,location}]`, HTTP POST to
   `https://hammer-claw-command-center.vercel.app/api/webhooks/calendar` with
   header `x-hc-signature: <HC_WEBHOOK_SECRET>` and body
   `{"date":"YYYY-MM-DD","events":[...]}`. The webhook + `GET
   /api/calendar/today` are built and cache under settings `calendar:<date>`.
2. **Pick a notification push channel.** `NOTIFY_WEBHOOK_URL` is unset, so
   notifications are in-app only (`/notifications`). Provide a Power Automate
   "push"/email-to-self flow URL to also push them out.
3. **Sloan sending address.** Unknown, so the app refuses to send as `sloan`
   (`canDraftAs`). Provide the from-address to enable it. Merit sending is
   live.
4. **Run the Phase 0 verification** (`docs/VERIFY-LIVE.md`): open
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

- ~~Set `CRON_SECRET` in Vercel~~ — set 2026-07-07; verified present in
  Production 2026-07-20.
- ~~Vercel plan decision for sub-daily crons~~ — on Pro as of 2026-07-20. The
  full five-job schedule is in `vercel.json` and `vercel.cron-pro.json` is
  deleted. Schedules are now timezone-gated in-handler, not hardcoded UTC
  offsets; see the 2026-07-20 CHANGELOG entry.
- ~~Retire the Cowork granola-triage step~~ — Jordan paused the Cowork granola
  artifact 2026-07-20. The app is the only Granola writer, so the 4-hourly
  `granola-pull` cron is live.

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
