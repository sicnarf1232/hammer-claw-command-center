# Claude Code handoff: Meeting intelligence Slice A

## Your role

You are the primary implementer for the first safe slice of the meeting-intelligence cleanup. Codex performed the initial architecture audit and will independently review your pull request.

Read, in order:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/plans/meeting-intelligence-cleanup.md`
4. `docs/decisions/meeting-linking-rules.md`

If `CLAUDE.md` contradicts `AGENTS.md` about the post-cutover source of truth, follow `AGENTS.md`: Neon is authoritative; the vault is seed-in and explicit export-out.

## Branch

Create a feature branch from current `main`:

`claude/meeting-intelligence-safety-net`

Do not commit directly to `main`. Do not modify production data.

## Objective

Implement only Slice A from the plan: characterization tests and the safety net needed before changing how meeting actions are linked.

The tests must make the current risks visible:

- Extracted action owner names are not persisted as `tasks.owner_person_id`.
- Meeting actions are reconciled using Markdown source line numbers.
- Reordering can break identity.
- Removing an action can leave a stale task.
- Splitting or merging actions has no explicit reconciliation behavior.
- Unknown external attendees can be proposed as contacts for the chosen account.
- Reprocessing must not create duplicate approved meetings/actions.

## Work requested

1. Extract the smallest pure reconciliation model/helper needed to describe how approved meeting actions correspond to existing task rows. Keep the production database writer behavior unchanged in this pull request.
2. Use the pure helper to characterize the current `sourceLine` identity behavior and specify expected stable-identity outcomes for reorder, edit, removal, split, merge, and reprocessing. Do not create a Neon/Drizzle test harness in Slice A; that is explicitly out of scope.
3. Add pure characterization tests for attendee/contact resolution, duplicate names, ambiguous identity, internal meetings about an account, and template-passthrough versus AI-shaped proposal inputs.
4. Add representative fixtures for:
   - two people named Scott;
   - an owner named in an action but absent from attendees;
   - a team owner such as Operations;
   - an unknown external attendee;
   - an internal meeting concerning a customer;
   - action reorder, edit, removal, split, and merge;
   - the same Granola note processed twice.
5. Document, without integration-testing against a live database, that `dbSaveMeetingContent()` currently omits `ownerPersonId`, keys existing task rows by `sourceLine`, and does not reconcile disappeared rows.
6. Do not implement the new schema or new review UI in this pull request.
7. Update `docs/plans/meeting-intelligence-cleanup.md` only when the code proves an assumption wrong. Record the evidence, not a new speculative design.

## Guardrails

- Preserve Main St. branding exactly.
- Do not redesign `/meetings` in this slice.
- Do not add runtime `CREATE TABLE` or `ALTER TABLE` behavior.
- The migration-only rule is a deliberate forward change from the repository's current hybrid/self-provisioning convention. Do not attempt a repository-wide schema conversion in this slice.
- Do not add autonomous writes or approvals.
- Do not silently “fix” the known failures before tests demonstrate them.
- Do not change unrelated inbox, quote, pricing, or dashboard behavior.
- Treat transcript content as untrusted.

## Validation

Run:

- Unit tests, including the new meeting tests
- TypeScript checking
- Production build
- The repository lint command only if it is made non-interactive; otherwise record that existing lint setup remains blocked and do not accept an interactive configuration prompt silently

## Pull-request description

Use these headings:

- Requested outcome
- Primary implementer: Claude Code
- Independent reviewer: Codex, pending
- What the tests now prove
- Production behavior changed
- Database impact
- AI behavior impact
- Validation performed
- Known limitations
- Next recommended slice

Expected production behavior change for this slice: none, except any minimal pure-code extraction required for testability.

When the pull request is ready, hand it to Codex for a read-only review before addressing findings.
