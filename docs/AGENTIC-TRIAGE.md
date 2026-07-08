# Agentic triage: the path from labels to a mini-me

Written 2026-07-08 after Jordan asked for the inbox to head toward
autonomous triage, and eventually autonomous replies and task creation.
The destination is an assistant that handles the inbox the way Jordan
would, with his trust earned in stages. The hard rule from the top of the
project still governs everything here: model output never becomes stored
canonical fact or outbound mail without Jordan's confirmation, unless
Jordan has explicitly delegated that class of action in writing (a
whitelist entry IS the standing confirmation, and it is revocable).

## The trust ladder

Each stage only unlocks when the stage before it has proven itself with
measured agreement, not vibes.

### Stage 0: label and learn (live today)
- AI triages every thread: pathway, priority, needs-reply, summary.
- Jordan works the queue: reviewed clears it from the working views
  (Needs attention, All mail), swipe right = reviewed, swipe left =
  archive, new inbound mail reopens the thread as unreviewed.
- Every manual correction latches (manual=true) and freezes the AI's
  original call in ai_snapshot. That is the training signal.

### Stage 0.5: measure agreement (next build step)
- A small metrics read: for every thread where Jordan acted, compare his
  action to the AI's original call. Agreement rate per pathway, per
  priority, and for needs-reply, over a rolling window.
- Surfaced on a /settings or /activity card: "Noise: 97% agreement over
  64 threads. Quote requests: 88% over 17."
- No behavior change. This is the evidence the later gates read.

### Stage 1: propose (the app asks first)
- Draft replies staged as proposals for needs-reply threads (ai_proposals
  kind email-reply), waiting in the thread view and a queue. Approve =
  send via the existing reply path. Nothing sends on its own.
- Task proposals: when a thread contains a clear commitment or ask, stage
  a create-task proposal with due date and account prefilled.
- Existing infra: the ai_proposals table and queue from the Granola
  propose-then-confirm work carry this without schema invention.

### Stage 2: scoped autonomy (whitelisted housekeeping)
- Gate: a pathway is eligible when agreement is at or above 95% over at
  least 50 decisions, and Jordan flips the switch for that pathway.
- First candidates: noise (auto-review + archive) and FYI (auto-review).
  These are reversible, low-blast-radius actions.
- Every autonomous action is logged to activity with provenance
  (origin=agent, the model, and the confidence) and shows in a daily
  digest. One click undoes any of them.

### Stage 3: autonomous replies for whitelisted classes
- Only after Stage 1 has a track record of approved-unedited drafts for
  a class (e.g. logistics acknowledgments, document resends).
- Hard fences regardless of class: never pricing, never commitments on
  dates or quantities, never new recipients, never external attachments
  that were not explicitly suggested and approved before.
- Kill switch in settings turns all autonomy off in one action.

## Design rules that make this safe

1. Provenance or it did not happen: every autonomous action carries
   origin, model, confidence, and the evidence it read.
2. Reversibility before autonomy: an action class is only eligible for
   autonomy if a one-click undo exists.
3. Agreement gates are per class, not global. The agent earns noise
   before it earns quotes.
4. The daily digest is not optional. Autonomy without a review surface
   rots trust.
5. New inbound mail always reopens a thread, including ones the agent
   closed.

## The /agents oversight view (Jordan, 2026-07-08: a permanent feature)

Where Jordan reviews, scores, and corrects agent work; the trust ladder
made visible. Four zones:

1. **Roster.** One card per agent: Triage, Drafter, Task Extractor,
   Brief Writer, Import Mapper. Stage, agreement score, volume this
   week, last active, per-agent kill switch. The Brain is interactive,
   not autonomous; it gets usage stats, not supervision.
2. **Review queue (the core loop).** Unified queue of agent work
   awaiting judgment: triage calls, drafted replies, task proposals.
   Verdicts: approve as-is (full credit), edit then approve (partial;
   the diff is training signal), reject with a reason code (wrong
   pathway, wrong tone, missed context, wrong recipient, too
   committal). Keyboard-driven.
3. **Scorecard (the gamification).** Rolling agreement, streaks, and a
   progress bar to the next gate. Gate met = the app proposes a
   PROMOTION Jordan flips deliberately. Levels: Observer, Proposer,
   Trusted (scoped autonomy), Delegate (autonomous replies).
4. **Ledger.** Every agent action with provenance (model, confidence,
   evidence link) and undo; daily digest rollup; weekly report with
   time-saved estimate.

Non-negotiables: demotion is first-class (agreement below gate pauses
autonomy automatically); never grade blind (evidence one click away);
blast-radius labels on every action class (only reversible classes are
autonomy-eligible); shadow mode before Proposer (the agent records what
it WOULD have done, scored against what Jordan did); cost and health per
agent (token spend, error rates, stale-queue alerts).

## Build order

1. Stage 0.5 metrics (small: one read over email_triage manual rows).
2. /agents page: roster + Triage scorecard from existing data (this is
   shadow mode for triage, live immediately).
3. Stage 1 reply proposals in the thread detail + the unified review
   queue on /agents.
4. Whitelist settings + Stage 2 noise/FYI autonomy behind the gate,
   promotions and demotions on /agents.
5. Digest card on the dashboard, then Stage 3 candidates by evidence.
