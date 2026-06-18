# Connectivity Roadmap — meetings ↔ tasks ↔ accounts ↔ contacts

## ▶ PICKUP — start here next session: Phase B (accounts & contacts) or Phase E (series)

Done so far: the **Film Room redesign**, **Phase A** (meetings carry real
tasks), **Phase C** (editable meeting notes), and **Phase D** (Film Room PDF +
copy-for-email). Phase D added a branded PDF of a meeting note or rolling series
plus a clean-HTML clipboard copy, reached from the detail header. Shared model
`lib/meetingShare.ts` (ShareDoc + email HTML); PDF in `lib/meetingPdf.ts`
(`pdf-lib`, multi-page, WinAnsi-sanitized); route `POST /api/meetings/pdf`;
client `components/MeetingShareButtons.tsx`. See CHANGELOG.

Two open phases remain, either order:
- **Phase B — accounts & contacts wiring**: assign a meeting to an account
  (triage proposes; user can change in the Phase-C editor already), resolve
  attendees to contacts, auto-create missing contacts, seed the directory from
  the vault (`300 Merit/People/`, account-note contacts, the roster).
- **Phase E — series as first-class**: widen series detection, let a series
  carry an account, render the aggregated rollup (open actions / decisions /
  numbers / watch-outs across sessions).

Also worth doing (operational, not a build): the existing meeting notes predate
Phase A, so they are tracking-only; pull today's meetings so new notes get the
dual-capture/flag format, then retire the Cowork Granola scheduler so there is
one writer. No em dashes in any generated output (house style).

Status: Phase D DONE (2026-06-18), typecheck + 78 tests + production build
clean. Next: Phase B or Phase E.

## Flow direction (locked)

Granola → **app** (triage, AI) → **vault** (source of truth). The app never
"refreshes FROM vault" as the primary action. The "Refresh from Vault" button
is removed (done). The Pull from Granola button is the ingest.

## Phase A — Meetings carry real tasks (the spine)

Every meeting action item becomes a trackable task.

- **Assigned/created date = the meeting date** (not today).
- **Due date comes from the action item.** If none, or it is a range / vague
  ("this week", "few days", "EOW"), **flag it** into a "Needs a due date" review
  the user clears (one tap to set a real date).
- **Owner classification** via the roster:
  - `me` (Jordan) → real tasks, surface in /today + /tasks.
  - `team` (Merit-internal attendees) → team commitments, tracked.
  - `customer` (customer-contact attendees) → customer deliverables, tracked,
    tied to the account.
- Writeback: re-introduce the inline-field row for Jordan's items (so /today and
  /tasks pick them up) plus an owner tag; team/customer items stay tracking-only
  but visible.

Note: the realign pass made meeting action items plain (`- [ ] Owner: task` +
`🗓️ Due:`) and they no longer feed /today. This phase reconnects them with the
owner + due-flag model above.

## Phase B — Accounts & contacts wiring

- **Assign a meeting to an account** (triage proposes; user can change).
- **Attendees → contacts.** Resolve each attendee to a contact on that account;
  **auto-create** a contact if missing. Seed the contact directory by pulling
  existing people from the vault (`300 Merit/People/`, account-note contacts,
  the roster). 
- Attendee classification (me/team/customer) is shared with Phase A's owner
  logic, so contacts and task-ownership stay consistent.

## Phase C — Editable meeting notes (in-app)

- Edit a meeting note in the app and write it back to the vault as a commit:
  title, **attendees (assignable)**, account, sections, action items, and
  **due dates** (clears Phase A flags). This is the surface that resolves
  flagged due dates and lets the user reassign attendees/owners.

## Phase D — Real PDF / share

- Generate a branded **Film Room PDF** of a meeting note (and series) for email
  sharing. Reuse the existing PDF pipeline (`lib/quotePdf.ts`). 
- Also offer **"copy for email"** (clean HTML) since Jordan often pastes into an
  email body; PDF stays the primary, best-looking path.

## Phase E — Series as first-class

- Series are real and plentiful: recurring meetings, **customer or internal**
  (not just the Nick/Mike 1:1s). The engine exists; this phase widens detection,
  lets series carry an account, and can render the design's aggregated rollup
  (open actions / decisions / numbers / watch-outs across sessions).

## Immediate

- [x] Remove "Refresh from Vault" button.
- [ ] Pull today's meetings: 2 are in Granola for 2026-06-17 and ready; press
      "Pull from Granola" to ingest. (Verified via Granola.)

## Open decisions

- **Owner tagging**: auto-classify by the action-item owner name against the
  roster (recommended), vs an explicit per-task picker.
- **Due-date flag surface**: a dedicated "Needs due date" queue, vs inline
  badges on the meeting/tasks views (recommended: both — badge + a filter).
- **Contact store**: keep contacts in the existing vault `People/` + account
  notes (recommended), vs a DB table.
- **PDF vs email-HTML**: PDF primary (confirmed), HTML copy as a nice-to-have.
