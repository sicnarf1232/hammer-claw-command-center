# VERIFY-LIVE: 5-minute production checklist

Run logged in at <https://hammer-claw-command-center.vercel.app>. Written
2026-07-06 (Phase 0). Claude cannot see the live UI; this is the human half of
the verification. Report anything that fails, in whatever shorthand you like.

## 1. Schema + env verdict (30 seconds, do this first)

Open **`/api/debug/schema`** and paste the JSON back to Claude. It settles, in
one shot:

- `documentsSpecExists` - whether the quote re-edit column was ever added
  (PUNCHLIST "quote re-edit").
- `brandKitsPaperExists` - whether the branding paper column exists
  (PUNCHLIST "branding paper color").
- `env.cronSecretSet` - expected **false** until you add `CRON_SECRET` in
  Vercel (until then the morning-brief and notify crons never run).
- `foreignKeys` - which tables actually carry FK constraints (decides delete
  ordering for the Phase 2 seed rework).
- `diff` - any drift between the live DB and every DDL source in the repo.

## 2. Visual pass (4 minutes)

Confirm each page renders in the Sea Glass dark theme with the Main St. mark
in the nav. Then:

- **/dashboard** - greeting + Ask bar; Today's commits; inbox snapshot tiles;
  accounts needing attention; right rail shows upcoming meetings (these come
  from the DB) and recent activity.
- **/today** - both tabs. Focus queue lists tasks; **Build Your Day** renders
  the 8am-7pm timeline. Calendar events will be empty (expected until the HC
  Calendar Push flow exists). "Plan my day" fills slots.
- **/tasks** - toggle Grouped and Table views. In Grouped: expand a card,
  check the internal-steps checklist and the "Send update" draft button.
- **/contacts** - relationship health list renders; some contacts show
  awaiting-reply or gone-quiet badges.
- **/inbox** - open a thread: triage chips + summary bar render (TriageBar),
  participant strip shows, reply box opens and "Generate" produces a draft
  (do not send unless you mean to; sending is live, not a draft).
- **/meetings** - list renders. Optional: press "Pull from Granola" and note
  the report card numbers. (After Phase 1 this becomes "proposals staged",
  with nothing written until you approve.)
- **/quote** - open a recent quote; the preview iframe renders. Note whether
  Re-edit is offered (cross-check with `documentsSpecExists`).
- **/branding** - note whether the "paper color" notice shows (cross-check
  with `brandKitsPaperExists`).
- **/notifications** - page renders; briefs will be missing if crons never
  ran (consistent with `cronSecretSet: false`).
- **Meeting PDF** - open a meeting, click Download PDF; confirm a PDF comes
  back on the Hobby plan (falls back to print view if the function is too
  big - report which you got).

## 3. Report back

Paste the `/api/debug/schema` JSON plus a one-liner per section above
(ok / broken / weird). That unblocks Phase 2.
