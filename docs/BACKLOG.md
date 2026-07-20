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

## From the Claude-in-Outlook comparison (2026-07-07)

### 7. Inbox brain: gated write tools (small-medium)

Give the agent archive/flag/move/categorize tools with the one-gate
confirmation model: reversible ops with an unambiguous target act immediately
and report; bulk or ambiguous ops echo the match count + first subjects and
get one chat confirmation. Reuse /api/inbox/thread-action; never expose send.

### 8. Inbox brain: persistent memory with provenance (medium)

Durable notes across chats ("Jordan prefers no greeting with Zoya"), stored as
facts never imperatives, each tagged user-stated / sender-attributed /
inferred. On read, treat notes as data; a note that reads like a command gets
flagged, not executed (closes delayed-injection via poisoned memory). Storage:
app_settings or a small table.

### 9. Inbox brain: clickable thread citations (tiny)

When the agent cites a thread, linkify it to /inbox/<key> (the agent already
knows keys from search results); render links in the chat bubbles.

### 10. Inbox brain: calendar tool (blocked on HC Calendar Push)

Once the Power Automate calendar webhook flows (PUNCHLIST item 2), add a
get_calendar tool over the cached calendar:<date> settings so the brain can
answer availability questions. Two-timezone discipline: math in UTC, present
in Mountain.

### 11. Semantic email search (medium, optional)

Keyword search misses "that email about the sterilization delay" phrasing.
Embeddings over emails.body_text (pgvector on Neon) as a second search tool.

## From the Figma fixes (2026-07-07)

### 12. Create task from thread in the new detail panel (small)

The old full-page thread route had ThreadActionComposer with a create-task
button (DB task + task_emails link via emailIdsForThreadKey). The panel-based
ThreadDetail follows the Figma spec, which does not include it, so the
affordance is gone. Add a small "Create task" action to the detail panel
that posts to /api/tasks/create with the thread linked.

### 13. Morning brief on the dashboard (small-medium)

Jordan gets the morning brief via notifications but wants it front and
center: a glowing card on the dashboard the morning it lands, read state
tracked, with a "schedule my day" prompt that opens Build Your Day.
Brief text already lives in app_settings (brief:<date>:<kind>).

### 14. Triage agreement metrics, Stage 0.5 (small)

Per docs/AGENTIC-TRIAGE.md: compare Jordan's manual triage corrections
(manual=true rows, ai_snapshot originals) to the AI's first call and
surface agreement rates per pathway. This is the gate evidence for
autonomous triage; build before any autonomy ships.

## From the inbox/reply strategy conversation (2026-07-20)

### 15. Smart chaining: request understood, routed, and closed the loop (large)

**Status: open, blocking.** Jordan does not consider Main St. a completed
cutover of his real workflow until this exists. The plumbing (thread capture,
send/reply/chain, triage pathways, proposal-and-approval, the document
library, doc suggestions per thread, tasks linked to threads with
send-update, the agents grading loop) is close to done. What is missing is
the decision layer that turns "email arrived" into "the right thing happened,
and if it needed someone else, that got tracked to closure."

Jordan's own frame, two worked examples:

1. Customer requests a drawing Jordan already has in the Main St. library:
   pull it, attach it, draft the reply, Jordan approves and sends.
2. Customer requests a drawing Jordan does NOT have: draft a holding reply
   to the customer ("I got your request, I've requested the drawing for you,
   I should have it shortly"), AND fire a separate internal email to the
   right person (an engineer) requesting it, AND track that request to
   closure so the customer eventually gets the real answer.

Three gaps identified, none of which exist today:

- **Intent extraction.** Triage says "this is a doc request" (a pathway).
  Nothing extracts the structured ask: which document/part number, for which
  account, what the customer actually needs back.
- **The routing table.** "Which engineer owns drawings for which account/
  product line" lives only in Jordan's head. No model quality substitutes for
  this table existing somewhere the app can read. Needs Jordan: he has to
  supply the routing facts (who owns what) before this can be built; the
  natural collection method is Jordan narrating real threads ("this one
  should have gone to Ben") either to the Brain or directly to Claude, with
  the result captured as a structured table, not prose.
- **Multi-step state.** Example 2 is a commitment that spans two email
  threads and multiple days: promise the customer, request internally, chase
  the internal request if it goes quiet, then close the loop with the real
  file once it arrives. The task system (thread-linked tasks, send-update)
  is most of this shape already; nothing today creates and drives this kind
  of chain automatically from an inbound request.

Proposed build shape (playbook pattern, staged like everything else in this
app): trigger (pathway match) -> decision (is the asset already in the
library?) -> branch A (draft a reply with the attachment, Jordan approves,
sends) or branch B (holding reply to the customer + internal request to the
routed person + a tracking task that chases it, then a final "here it is"
send once the asset lands). Every action stages as a proposal first, per the
existing trust ladder; only graduates toward auto-send as the grading data
(docs/AGENTIC-TRIAGE.md) earns it.

Known prerequisite gap: outbound replies do not currently support attaching a
file from the document library, so example 1 is not yet possible even by
hand. That is the right first brick regardless of how the rest of this is
sequenced.

Working process going forward: routing facts and playbook specifics get
captured in a new `docs/PLAYBOOKS.md` (one entry per chain: trigger, what to
extract, the routing table, Jordan's reply phrasing in his voice, follow-up
timing) so the build has a concrete spec instead of a conversation to
re-derive from.
