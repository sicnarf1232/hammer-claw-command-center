# Backlog — captured feedback awaiting scheduling

Items from Jordan's reviews that are real work but not yet slotted into a
phase. Each carries enough context to build from cold. Move an item into the
plan (and delete it here) when it gets scheduled.

## From the 2026-07-07 visual review (Main St. live pass)

(Item 1, the inbox + dashboard email overhaul, shipped 2026-07-07: subject-led
rows with linked-task context, newest-first threads, Merit/Customer message
distinction, per-message reply anchoring, quoted-history collapse.)

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

### 5. People merge / delete tool (small-medium)

When the import's dedupe misses (two rows for one human), let the user merge
one person into another (re-point person_aliases, emails.person_id,
meeting_attendees, tasks.owner_person_id; keep the richer fields; add the
loser's name as an alias) or delete a junk person row outright. Natural home:
the /contacts review queue or a person profile action.

### 6. Quote drafts + default brand setting (small; fold into Phase 4)

Let a quote be saved as a DRAFT (server-side; the quote_drafts table already
exists and is unused by the builder, which only persists to localStorage).
Default quote header stays Merit red, but the default becomes a setting once
Phase 4 threads brand kits through quote rendering (template registry).

(Items 3 and 4, circle contrast and the notification bell, shipped 2026-07-07
during Phase 2. Review-queue verbiage + inline account creation shipped same
day after the seed review.)
