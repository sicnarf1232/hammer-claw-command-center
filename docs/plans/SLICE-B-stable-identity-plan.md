# Slice B implementation plan: stable meeting-action identity + linking contract

Status: plan for review, then implement. Branch `claude/meeting-intelligence-stable-identity`.

Goal: give every extracted meeting action a stable identity that is independent of
its Markdown line number, and carry a structured linking contract on the proposal
payload, so later slices can reconcile, review, and persist links safely. This
slice adds the identity + contract + schema column. It does NOT rewire the
production writer (that is Slice D) and does NOT build the people/account resolver
(later slices).

## 1. Stable action ID format and where it is created

- Format: `act_` + 22 lowercase base32 chars derived from `sha256(seed)`.
  Opaque and permanent once minted. Example `act_k3mf7q2v9x...`.
- Seed (minted once, at extraction time): `${granolaId}#${fingerprint}#${dupIndex}`
  where `fingerprint = sha256(normalize(text)).slice(0,16)` and `dupIndex` is the
  occurrence index among actions in the SAME note that share a fingerprint
  (0 for the normal unique-text case).
  - Deterministic, so re-pulling an unedited Granola note reproduces the same
    IDs (reprocessing idempotency).
  - Seed excludes line position, so REORDER yields identical IDs.
  - `dupIndex` only bites when two action lines are byte-identical; identical
    lines are interchangeable, so the assignment is still reorder-invariant for
    distinct actions.
- Created in a new pure module `lib/meetingActionIdentity.ts`
  (`mintActionIdsForNote(granolaId, texts[])`), called from the contract builder
  during the Granola pull (`lib/meetingsPull.ts`). Minted ONCE; thereafter the
  ID is carried, never recomputed. Editing wording at review time keeps the ID
  even though the fingerprint changes (the fingerprint is only an extraction
  hint, per docs/decisions/meeting-linking-rules.md "Stable action identity").

## 2. Schema changes and migration files

- New checked-in migration `drizzle/0010_meeting_action_identity.sql`:
  - `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS action_id text;`
  - `CREATE INDEX IF NOT EXISTS tasks_action_id_idx ON tasks (action_id);`
  - Includes a commented, explicit `-- Rollback:` block (drop index, drop column)
    so the change is reversible. drizzle-kit here is forward-only, so the reverse
    lives in-file as the documented down step.
- Mirror the column in `lib/db/schema.ts` (`actionId: text("action_id")` + index).
- NO runtime `CREATE TABLE`/`ALTER TABLE` self-provisioning is added for this
  column (deliberate migration-only forward change, per cleanup plan gap 8 and
  the Slice A guardrail). The column is nullable and unused by Slice B code paths;
  Slice D populates it.
- The proposal's structured actions ride inside the existing `ai_proposals.payload`
  jsonb, so extending the proposal contract needs NO migration.

## 3. Changes to the proposal and meeting-action types

In `lib/proposals/types.ts`:
- New `ActionReviewState = "assigned"|"suggested"|"ambiguous"|"unassigned"|"group"|"rejected"`
  (matches linking-rules "Action ownership states").
- New `MeetingActionProposal` carrying: `actionId`, `fingerprint`, `text`,
  `ownerText`, `ownerClass`, `candidatePersonIds: number[]`,
  `candidateAccountIds: number[]`, `reasons: string[]`, `confidence`,
  `reviewState`, `isJordans`, `due`, `dueText`.
- `MeetingFilePayload` gains OPTIONAL `actions?: MeetingActionProposal[]`,
  optional `relatedAccounts?: string[]`, and optional `contractVersion?: number`.
  Optional = already-pending legacy payloads (no `actions`) stay valid.

New pure builder `lib/meetingActionContract.ts`:
- `buildActionProposals(granolaId, actionItems)` maps triaged action items (from
  BOTH the AI path and the template-passthrough path, which share the
  `TriagedActionItem` shape) into `MeetingActionProposal[]`.
- Slice B does NOT resolve identities: `candidatePersonIds`/`candidateAccountIds`
  stay `[]`. `reviewState` is set only from the already-computed `ownerClass`:
  `team` -> `group`; everything else with an owner or none -> `unassigned`;
  no owner text also -> `unassigned`. Nothing is promoted to `assigned`/
  `suggested`/`ambiguous` here (that needs the resolver, deferred). This honors
  "keep uncertain unresolved, do not silently guess."

## 4. How existing records remain compatible

- `tasks.action_id` is nullable; every existing task row is valid with NULL.
- `MeetingFilePayload.actions` is optional; pending legacy proposals execute
  unchanged. `executeMeeting.ts` / `dbSaveMeetingContent` are UNTOUCHED, so the
  current line-based task sync (and its Slice A characterization) still holds.
- Rendered `content` markdown is unchanged; meeting display/export unaffected.
- Adding `action_id` to the Drizzle schema means full `select().from(tasks)`
  calls will reference the column, so the migration must be applied BEFORE the
  code deploys (standard expand ordering; documented in the PR rollout).

## 5. Pure tests proving IDs survive reorder and edit-in-place

- `lib/meetingActionIdentity.test.ts`: fingerprint normalization; mint
  determinism; REORDER -> identical ID set; different granolaId -> different IDs;
  duplicate-text disambiguation.
- Add `reconcileActionsById()` to `lib/meetingActionReconcile.ts` (additive; the
  Slice A line-based model and its tests are untouched) and test that, keyed on
  the stable ID:
  - REORDER -> all updates, 0 inserts, 0 stranded, IDs stable (the exact case
    Slice A proved the line-based writer corrupts).
  - EDIT-IN-PLACE -> the carried ID survives and new wording is written; 0
    inserts, 0 stranded.
  - REMOVAL -> exactly the removed action's ID strands (so Slice D can archive
    it by ID instead of leaving a stale line-based row).
- `lib/meetingActionContract.test.ts`: AI-path and template-path action lists
  produce the identical contract shape; team owner -> `group`; unknown/absent
  owner stays `unassigned` with empty candidate arrays (no guessing); Jordan's
  action carries `isJordans` but is still left unresolved (no person id written).
- All tests are pure (fixtures only). No Neon, no network.

## 6. Explicitly deferred to later slices

- Populating `candidatePersonIds` / `candidateAccountIds`, reasons, and
  confidence (the people/account linking engine) -> later slice.
- Rewiring `dbSaveMeetingContent` to reconcile by `action_id`, write
  `owner_person_id`, and archive/supersede removed/split/merged actions -> Slice D.
- The structured review UI on `/meetings` -> Slice C (Meetings page not touched).
- A relational primary/related-accounts table: meetings.account_id already holds
  the primary and related accounts stay in the note + contract, so no table is
  added now -> revisit in a later slice if needed.
- Any identity-merge tooling -> Slice E.
