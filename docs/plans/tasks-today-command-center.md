# Tasks Workflow + Today Command Center — implementation plan

Status: PLAN for review (Codex), implementation not started.
Planner: Claude Code. Independent reviewer: Codex, pending.
Inspiration: `design-reference/jordan_main_st_command.html` (workflow and layout
only; Main St. branding, colors, typography, nav, and component conventions are
preserved — the reference's own branding is NOT copied).

## What Jordan gets, in plain language

Today the /tasks page is a competent list and /today is a due-date queue. What
neither answers at a glance is: which of these needs me RIGHT NOW, which is
coming, which am I just watching someone else carry — and where did this task
even come from?

After this slice:

- Every task row reads like the reference's rows: title, then a context line
  (account, type, owner, the meeting it came from), with due date and priority
  scannable on the right.
- Opening a task explains its origin: "Created from meeting: Intuitive weekly
  sync (2026-07-20)" with a working link back to that meeting note. This uses
  the meeting link Slice D now writes on every meeting-born task.
- /today opens on Command Lanes: three columns — Now, Next, Watch — built from
  real task records with a visible reason on each card ("overdue 2 days",
  "waiting on Operations"). No AI, no invented numbers: every card is a real
  task, every reason is derived from fields already in the database.
- Loading, empty, and error states exist for every new surface, and everything
  works on the phone.

## Scope guardrails

- No branding changes. Main St. tokens (`card`, `eyebrow`, `btn`, chip
  patterns, dark default) as-is; the reference's palette/fonts are ignored.
- No redesign of unrelated pages (dashboard, inbox, meetings untouched).
- No invented production data: the reference's metric strip ($20.0M managed
  book, complaint clocks, forecast variance) is OUT — we have no such data
  source; nothing is fabricated to fill the layout.
- No AI calls anywhere in this slice; classification is pure deterministic code.
- Strong preference honored: ZERO database schema changes (confirmed below).

## 1. Exact files to add or change

New:

| File | Purpose |
|---|---|
| `lib/attention.ts` | Pure Now/Next/Watch classifier + per-task reason strings |
| `lib/attention.test.ts` | Classifier tests (rules table below) |
| `components/CommandLanes.tsx` | Client component: three-lane grid of work cards |
| `components/TaskProvenance.tsx` | "Created from meeting" block for task detail |

Changed:

| File | Change |
|---|---|
| `lib/vault/types.ts` | `Task` gains optional `sourceMeeting?: { id, title, date, path }` (additive; vault parser never sets it) |
| `lib/tasksDb.ts` | `tasksFromDb()` LEFT JOINs `meetings` on `tasks.meeting_id`; `rowToTask` carries `sourceMeeting`; archived exclusion unchanged |
| `lib/taskView.ts` | `TaskView` gains `sourceMeeting`; `toTaskView` passes it through |
| `app/today/page.tsx` | Loads ALL open tasks (not just due) + accounts + task meta; renders lanes tab first; error card unchanged pattern |
| `components/TodayTabs.tsx` | Three tabs: Command lanes (default) · Focus queue · Build your day |
| `components/TaskList.tsx` / `components/TaskRow.tsx` | Context sub-line: account · type · owner · source meeting; due+priority right-aligned |
| `components/TasksTable.tsx` | Detail panel gains `TaskProvenance`; source-meeting chip in rows; attention filter chips (All / Mine / Waiting / At risk / Due today) alongside the existing workstream filter |
| `components/TasksGrouped.tsx` | Same provenance block on `TaskCard`; same chips |
| `app/tasks/page.tsx` | No structural change; passes the enriched views through |

Nothing else. `BuildYourDay`, QuickAdd, inline editing, quote handoff, linked
emails/meetings pickers all continue working unchanged (`TaskView` only grows).

## 2. Data queries and relationships

- `tasks` → `meetings` via existing `tasks.meeting_id` (written by the Slice D
  writer, with stable `action_id` identity). One LEFT JOIN added to the
  existing single-query `tasksFromDb()`:
  `left join meetings on tasks.meeting_id = meetings.id`, selecting
  `meetings.id, title, date, source_path`. Meeting deep link is
  `/meetings?note=<source_path>` — the same convention `linkedMeetingsForTask`
  and every other meeting surface already uses; a null `source_path` skips the
  link (DB-only meeting), matching `LinkedMeetingRef` behavior.
- Owner display: already solved — `tasksFromDb` joins `people` on
  `owner_person_id` into `Task.delegate`; no query change.
- Manual/AI meeting links (the `task_meetings` join table) remain a separate,
  existing panel (`/api/tasks/linked-meetings`); provenance (source meeting) and
  manual links are shown as distinct things, matching their distinct meanings.
- /today switches from `getTodayTasks()` (due/overdue only) to the same
  `getAllTasks()` + account lookup + `getTaskMeta` load /tasks uses, because
  Next and Watch lanes need open tasks that are not yet due. Focus queue keeps
  its due-only framing by filtering the same payload (one fetch, both tabs).
- Archived tasks (Slice D `status='archived'`) are already excluded in
  `tasksFromDb`; lanes inherit that for free.

## 3. Task card and task detail structure

Task row/card (both views, mirroring the reference's `task-row`):

```
[✓] Title (cleanTaskTitle)                       [due date]
    Account · Type · Owner: Nick Patel ·          [priority chip]
    From: Intuitive weekly sync (07-20)
```

- Sub-line pieces render only when present (no empty separators).
- Owner chip: `delegatedTo.name`, or "You" when unset (all rows are Jordan's).
- "From: <meeting>" is a link chip; absent for vault-born/app-created tasks.

Task detail (existing expandable detail in TasksTable / TaskCard in grouped
view) gains one block at the top, `TaskProvenance`:

```
CREATED FROM
Meeting: Intuitive Surgical weekly sync — 2026-07-20   [Open meeting →]
Owner as extracted: Nick Patel        Status: waiting
```

- Data comes free with the page payload (the JOIN), zero extra API calls.
- Below it, the existing linked-meetings/emails panels stay as "Related links".

## 4. Now / Next / Watch classification rules

Pure function in `lib/attention.ts`; input `(views: TaskView[], today: string)`,
output `{ now, next, watch, rest }`, each entry `{ view, reason }` with a
human-readable reason shown on the card. Deterministic, tested, no AI.

Precedence per task (first match wins):

| Lane | Rule | Reason shown |
|---|---|---|
| (skip) | `done` | — (never shown) |
| Now | overdue (`due < today`) AND NOT waiting/blocked | "Overdue N days" |
| Now | `due == today` AND NOT waiting/blocked | "Due today" |
| Now | overdue AND waiting/blocked | "Overdue while waiting — chase it" |
| Now | `priority == high` AND due within 2 days | "High priority, due <date>" |
| Watch | `taskStatus` waiting/blocked | "Waiting" / "Blocked" (+ owner name if delegated) |
| Watch | `delegatedTo` set (not overdue) | "With <name>" |
| Next | due within 7 days | "Due <weekday>" |
| Next | `priority == high` (no due) | "High priority, no date" |
| Next | `start` (scheduled) within 7 days | "Starts <date>" |
| rest | everything else | — (lanes link to the full /tasks board) |

- `someday` status is never Now/Next; it lands in Watch only if delegated,
  else rest.
- Lane sort: due asc (missing due last), then priority (high > med > low).
- Lane cap: 7 visible per lane + "N more on the board →" link to /tasks with
  the matching filter; caps keep the lanes scannable like the reference.
- Edge cases tested: no due date, malformed due string (non-ISO → treated as
  no due, never NaN), delegated+overdue (Now, chase), waiting+due-today (Now).

## 5. Responsive behavior

- Lanes: CSS grid `grid-cols-1 md:grid-cols-3` (stack on phones, three columns
  from md up), matching how the meetings/accounts grids already respond.
- Task rows: sub-line wraps (`flex-wrap`); due/priority column stays pinned
  right on ≥sm, folds under the title on very narrow screens.
- Filter chips: horizontal scroll on overflow (`overflow-x-auto`), the same
  treatment the existing pill rows use.
- Tables keep the existing `overflow-x-auto` wrapper; no new horizontal page
  scroll anywhere (checked at 390px).

## 6. Loading, empty, and error states

- Loading: /today and /tasks are server components; the existing route-level
  skeleton stays. The lanes tab renders server-side with the payload, so no
  client fetch spinner is needed; the tab switch is instant on local state.
- Empty: per-lane empty text in the Main St. card voice — Now: "Nothing needs
  you right now."; Next: "Nothing queued this week."; Watch: "Nothing waiting
  on others."; all-empty: single card "You are clear. Check the board for
  backlog." with a link to /tasks. No fake placeholder cards.
- Error: the existing red error card pattern (`card border-danger/30 …`)
  verbatim, same as both pages today; a lanes classification error can only be
  a data-load error (the classifier is pure), so the page-level error covers it.
- Provenance block: renders nothing when `sourceMeeting` is null (vault-born
  tasks) — absence is the empty state, no placeholder.

## 7. Accessibility requirements

- Lanes are a list of regions: `<section aria-labelledby>` per lane with real
  `<h3>` headings; cards are `<article>` with the task title as the accessible
  name; the whole card is NOT a click target — the title link and the checkbox
  are, keeping focus order sane.
- Reasons and status are text chips, never color-only; chip colors reuse the
  existing ok/due/danger token classes with visible labels.
- Complete-checkbox buttons keep/extend the existing `aria-label` pattern
  ("Complete task: <title>").
- Filter chips: `aria-pressed` on toggle buttons; the active chip is announced.
- Meeting links have descriptive text ("Open meeting: <title>"), no bare icons.
- Keyboard: everything reachable in DOM order; no positive tabindex; tab switch
  buttons already follow the existing TodayTabs pattern.
- Contrast: existing token pairs only (fg/muted on surface), nothing custom.

## 8. Tests

All pure, no DB, matching the repo's testing convention:

- `lib/attention.test.ts`: every rule row above, precedence (overdue beats
  waiting-Watch; high-priority-due-soon beats Next), sorting, caps, malformed
  due dates, delegated+overdue, someday handling, empty input.
- `lib/taskView.test.ts` (extend): `sourceMeeting` pass-through, absent for
  vault tasks; existing title-cleaning tests untouched.
- `lib/tasksDb` mapping: export `rowToTask` (currently private) and add a pure
  test that a row+meeting-join tuple maps `sourceMeeting` correctly and that
  null meeting columns map to undefined. (Export-for-test only; no behavior
  change.)
- Component logic that is pure (lane cap + "N more" math) lives in
  `lib/attention.ts`, not JSX, so it is testable without a component harness.

## 9. Screenshot verification

Implementation-PR checklist (not this planning PR):

1. Run the app locally against the preview Neon branch (never production):
   `POSTGRES_URL=<preview> npm run dev`.
2. Capture: /today lanes (desktop 1440w, mobile 390w), /tasks grouped + table
   with the new sub-lines (1440w, 390w), one expanded task detail showing the
   provenance block, one per-lane empty state (empty preview data or a
   filtered account).
3. Attach the screenshots to the implementation PR; Codex reviews them against
   this plan's structure and the no-branding-drift guardrail.

## 10. Database changes

None. Confirmed against the live schema: everything needed already exists —
`tasks.meeting_id` (+ FK to meetings), `tasks.action_id` (Slice B/D),
`tasks.owner_person_id` (joined today), `tasks.status` (archived exclusion +
waiting/blocked values), `meetings.source_path` for deep links. No migration,
no runtime DDL, no data backfill; tasks created before Slice D simply have no
provenance block, which is truthful.

## Out of scope (explicitly)

- The reference's metric strip, account-pulse table, AI operating brief, live
  activity timeline, complaint clocks, forecast signals: either no data source
  exists or they belong to the Command Dashboard slice (cleanup plan Slice F).
- Global search / ⌘K, drawer-style detail, nav changes.
- Meeting-page changes; people/account linking engine work.
- Any write-path change: this slice is read/present-only, plus no new writers.

## Sequencing note

Single implementation branch + PR after this plan is approved:
`claude/tasks-today-command-center`. It is one reviewable slice: the data
enrichment (JOIN + projection) and the two page surfaces land together because
the lanes and provenance are what make the enrichment visible and testable.
