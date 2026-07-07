# Backlog — captured feedback awaiting scheduling

Items from Jordan's reviews that are real work but not yet slotted into a
phase. Each carries enough context to build from cold. Move an item into the
plan (and delete it here) when it gets scheduled.

## From the 2026-07-07 visual review (Main St. live pass)

### 1. Dashboard inbox snapshot + inbox list: information hierarchy (medium)

Today a row leads with the SENDER in big bold type and the description as
plain text below. The sender is rarely the point. A needs-reply email matters
because of what it is attached to: a project, an opportunity, a past-due task.
Rework the row hierarchy so the "why this matters" is the visual lead for
needs-reply items (linked task due date, account/opportunity, triage pathway),
with sender secondary. Applies to the dashboard center email section and
`components/InboxList.tsx` together (one design, two surfaces).
Sequencing note: the "because it is linked to X" context gets much richer
after Phase 2 (DB-backed tasks + `task_meta.linked_thread_key` +
`task_emails`), so this lands best post-cutover.

### 2. Build Your Day: editable plan + timer + AI day shaping (large, own phase)

After "Plan my day" the blocks are take-it-or-leave-it. Wanted:
- **Edit a placed block**: change allotted time, drag the block's edge to
  resize duration, drag the whole block to a later slot.
- **Breaks**: planning all day back-to-back is unrealistic. A small onboarding
  questionnaire (or settings toggle) to learn break preferences; the greedy
  slot-fill then reserves breaks.
- **Task timer**: start when a task begins, stop when done; sessions saved
  (likely `app_settings` or a small table) and rolled into a dashboard KPI:
  time spent, per task / per area of the app, over time.
- **AI day shaping**: a prompt box ("what does your day need to look like?")
  with hot items Jordan knows must happen; the model smart-links each hot item
  to an existing task where one matches, otherwise suggests creating a task
  (depends on Phase 2 DB-first task creation).

(Items 3 and 4, circle contrast and the notification bell, shipped 2026-07-07
during Phase 2.)
