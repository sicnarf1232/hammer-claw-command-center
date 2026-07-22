# Meeting intelligence cleanup

Status: Codex planning pass complete, implementation not started

## Outcome in Jordan's language

When a transcript lands in Meetings, Main St. should reliably answer:

- What happened?
- What was decided?
- What actions came out of it?
- Who actually owns each action?
- Which account does it belong to?
- Why did Main St. make that connection?
- What still needs Jordan to confirm?

The meeting note remains easy to read, while the structured records underneath become safe enough to power Now, Next, Watch and account timelines.

## Current workflow

1. `lib/meetingsPull.ts` reads Granola notes and calendar invitees.
2. Notes already matching Jordan's template are parsed deterministically by `lib/noteTemplate.ts`. Other notes are structured by `triageMeeting()` in `lib/ai.ts`.
3. The AI returns a meeting account name, attendees, actions, owner names, due dates, decisions, numbers, and watch-outs.
4. `lib/meetingsPull.ts` classifies each owner as Jordan, team, customer, or unknown using the roster.
5. A frozen Markdown meeting proposal is staged in `ai_proposals`.
6. `components/ProposalQueue.tsx` lets Jordan approve/reject the proposal, edit raw note Markdown, and edit the list of contacts proposed for the chosen account.
7. On approval, `lib/proposals/executeMeeting.ts` calls `dbSaveMeetingContent()` after cutover.
8. `lib/meetingsDb.ts` parses the approved Markdown and synchronizes action items into `tasks`.
9. The normal meeting editor later rewrites the Markdown representation through `components/MeetingEditor.tsx` and `lib/meetingEdit.ts`.

## Confirmed gaps

### 1. Extracted owner names do not become person links

`dbSaveMeetingContent()` stores task text, meeting ID, and account ID, but does not resolve or write `tasks.owner_person_id`. The owner survives only as text embedded in the meeting note.

Effect: the app can display “Scott” while the database cannot reliably answer which Scott owns the action.

### 2. Action identity depends on Markdown line number

Meeting tasks are matched through `source_path + source_line`. Reordering or rewriting action lines changes the line number.

Effect: edits, splits, merges, and removals can create new tasks or leave stale task rows. The writer intentionally never deletes because other records may reference a task, but it has no archive/supersession reconciliation for actions that disappeared.

### 3. Review hides the important decisions

The proposal queue exposes raw Markdown and contact names. It does not provide a structured review of each action's owner, account, confidence, evidence, or ambiguity.

Effect: Jordan must proofread prose and infer what the system linked. A single Approve accepts several different decisions at once.

### 4. Account matching is name-based and single-account

The AI chooses an account display name. Later database resolution uses a case-insensitive exact name. Internal meetings can carry related-account text in the note, but structured action-level account decisions are not reviewed or persisted.

Effect: an internal meeting about a customer, or a meeting covering several accounts, cannot express the real relationship cleanly.

### 5. Unknown external attendees may be proposed as customer contacts

For a customer meeting, `resolveAttendees()` proposes any non-Merit attendee, including unknown identities, as a new contact on that account.

Effect: a guest, vendor, malformed name, or incorrectly classified person can be added to the customer account unless Jordan catches it in the contact list.

### 6. The AI explanation is not stored

The meeting proposal records the model and final Markdown, but not per-action evidence, candidate identities, confidence, or a human-readable explanation.

Effect: incorrect matching is difficult to diagnose and future quality cannot be measured.

### 7. Template passthrough and AI parsing produce the same shallow owner shape

Skipping a second AI pass for an already-templated note is sensible. However, both paths eventually produce only an owner string. Deterministic identity resolution still needs to run after either extraction path.

## Proposed target workflow

```text
Granola transcript / templated summary
        ↓
Extract meeting facts and candidate actions
        ↓
Deterministic person + account candidate resolver
        ↓
Structured proposal with reasons and confidence
        ↓
Jordan reviews meeting, people, accounts, and actions
        ↓
Approved meeting + stable action records + task links
        ↓
Activity history and command dashboard
```

The model extracts meaning. Deterministic code resolves known identities. Jordan resolves ambiguity.

## Implementation slices

### Slice A: Characterization and safety net

Do not change production behavior yet.

- Add tests that capture the current Granola/template-to-proposal behavior.
- Add database synchronization tests for reorder, edit, remove, split, merge, and reprocessing scenarios.
- Add fixtures for duplicate first names, unknown attendees, internal meetings about customers, and multi-account meetings.
- Document the current production schema needed by meetings and tasks.

Acceptance:

- Tests demonstrate the current owner-link and line-number problems before the fix.
- Existing 540 unit tests still pass.

### Slice B: Stable identity and proposal contract

- Add checked-in migrations for stable meeting-action records or stable action IDs on the chosen canonical structure.
- Extend the meeting proposal payload with structured actions rather than relying only on rendered Markdown.
- For each proposed action carry original text, source evidence/reference, owner text, candidate person IDs, candidate account IDs, reasons, confidence, and review state.
- Add an explicit relationship for meeting primary account and related accounts if the existing schema cannot represent both safely.
- Preserve backward compatibility for already-pending proposals.

Likely files:

- `lib/proposals/types.ts`
- `lib/proposals/schema.ts` and a new Drizzle migration
- `lib/ai.ts`
- `lib/noteTemplate.ts`
- New pure resolver modules under `lib/meeting*`
- `lib/meetingsPull.ts`

Acceptance:

- Both AI and template-passthrough paths produce the same structured proposal contract.
- Ambiguous identities remain unresolved.
- No request-time schema creation is added.

### Slice C: Action review interface

- Replace raw-Markdown-first review with a structured meeting review card.
- Keep an advanced note preview/editor available, but do not make it the primary way to correct links.
- Allow accept, search/change, create missing record, unassign, group ownership, reject, split, and merge.
- Show a concise “Why this match?” explanation and source evidence.
- Allow meeting primary account and related accounts to be reviewed separately.
- Preserve the current Main St. visual system.

Likely files:

- `components/ProposalQueue.tsx` split into smaller meeting review components
- `app/meetings/page.tsx`
- `app/api/proposals/update/route.ts`
- New person/account search or reuse of existing search endpoints

Acceptance:

- Jordan can understand and correct every identity decision without editing Markdown.
- Approval is blocked only for genuinely required unresolved fields, according to agreed rules.
- Mobile review remains usable.

### Slice D: Correct persistence and reconciliation

- Write confirmed owner person IDs and account IDs when actions become tasks.
- Reconcile actions using stable IDs, not Markdown line numbers.
- Archive/supersede removed, rejected, split, and merged actions without breaking task references.
- Preserve manual links during reprocessing.
- Record review history and activity.
- Keep Markdown as an export/rendering representation, not the only structured identity carrier.

Likely files:

- `lib/meetingsDb.ts`
- `lib/meetingEdit.ts`
- `app/api/meetings/note/route.ts`
- Task and meeting schema/migrations
- Activity writer once its canonical shape is agreed

Acceptance:

- Reorder and wording edits preserve task identity.
- Removal does not leave an unexplained active task.
- Reprocessing the same Granola note is idempotent.
- Confirmed owner/account links survive later AI runs.

### Slice E: Identity cleanup tools

- Merge duplicate people transactionally.
- Repoint aliases, meeting attendees, task owners, email participant links, and other person references.
- Add aliases and correct account/classification.
- Provide a safe junk-person archive/delete rule.
- Log the merge and make it auditable.

Acceptance:

- Duplicate names can be resolved without orphaning records.
- Future meeting matches use confirmed aliases.

### Slice F: Dashboard handoff

After the meeting data is trustworthy, expose confirmed meeting actions in the Command Dashboard's Now, Next, and Watch lanes and account pulse.

## Test matrix

- Two active people named Scott.
- Full-name exact match and confirmed alias match.
- Same name at different accounts.
- Internal and customer people with similar names.
- Person named in action but absent from attendee list.
- Attendee present but no action owner stated.
- Team/function owner such as Quality or Operations.
- No account, one account, and multiple related accounts.
- Internal meeting about a customer account.
- Unknown external attendee who must not be silently created.
- Same Granola note processed twice.
- Pending proposal from the legacy payload shape.
- Action reordered, edited, removed, split, merged, and rejected.
- Confirmed correction followed by reprocessing.
- Malicious instructions inside transcript/summary content.
- Database failure during approval, with safe retry and no duplicates.

## Rollout

1. Implement Slice A in a feature branch.
2. Create a preview Neon branch and verify migrations there.
3. Implement B and C behind a meeting-review feature flag if the transition cannot be atomic.
4. Backfill stable action links for a small, inspectable meeting sample.
5. Let Jordan review the sample in preview.
6. Implement D and the remaining backfill only after sample acceptance.
7. Add identity merge tools in E.
8. Begin the Command Dashboard after meeting-link quality is accepted.

## Explicit non-goals for the first implementation pull request

- No Command Dashboard redesign yet.
- No autonomous meeting approval.
- No automatic creation of ambiguous people or accounts.
- No production database mutation during development.
- No Main St. rebrand.
- No rewrite of the entire meeting page in one pull request.

