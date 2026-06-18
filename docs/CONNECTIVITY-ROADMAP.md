# Connectivity Roadmap — meetings ↔ tasks ↔ accounts ↔ contacts

## ▶ PICKUP — start here next session: Phase E (series as first-class)

Done so far: the **Film Room redesign**, **Phase A** (meetings carry real
tasks), **Phase C** (editable meeting notes), **Phase D** (Film Room PDF +
copy-for-email), the **Accounts master-detail redesign**, and **Phase B**
(attendees → contacts, auto-create). Phase B resolves attendees against the
account + roster and auto-creates missing customer contacts on the account note,
via a "Sync contacts" button on a meeting and automatically during the Granola
pull. `lib/contacts.ts` (resolution) + `lib/contactsWrite.ts` (write) +
`addAccountContacts`; route `POST /api/meetings/sync-contacts`. See CHANGELOG.

One core phase remains:
- **Phase E — series as first-class**: widen series detection, let a series
  carry an account, render the aggregated rollup (open actions / decisions /
  numbers / watch-outs across sessions).

Phase B leftovers worth a follow-on: parse `300 Merit/People/` person notes into
the contact directory (format not pinned in docs/02 — ask Jordan), and capture
contact emails (Granola gives attendee names, not addresses).

Also done (2026-06-18): the **Accounts page** now matches the Film Room
master-detail design (list + tabbed detail; `getAccountsHub` in
`lib/accounts.ts`, `components/AccountsHub.tsx`). Phase B contacts wiring is the
natural follow-on (resolve/auto-create contacts into the Contacts tab). Deferred
in that UI: the Pricing tab (no per-account pricing data) and "+ Log activity".

Operational note (2026-06-18): ran the Granola pull; `considered: 0` (nothing
created after the newest indexed day 2026-06-17), so it was a no-op. Existing
notes predate Phase A and stay tracking-only; only future meetings arrive in the
dual-capture/flag format. Still pending: retire the Cowork Granola scheduler so
there is one writer once the app pull is trusted. No em dashes in generated
output (house style).

Status: Phase D + Accounts redesign DONE (2026-06-18), typecheck + 78 tests +
production build clean. Next: Phase B (contacts wiring) or Phase E (series).

## Milestone 2 — App as the Merit OEM brain (captured 2026-06-18)

Jordan's direction: the app should stop being "basic," become genuinely
intuitive, and eventually cut from the vault to become its own source of truth
(a DB-backed brain + AI for the Merit Medical OEM team). Captured items, roughly
in priority order:

1. **Tasks page** (DONE 2026-06-18): sortable/filterable table, columns
   Task/Account/Type/Status/Start/Due, Merit-default scope, Nextech dropped,
   derived OEM "type of request". See CHANGELOG.
2. **Editable accounts** (DONE 2026-06-18): account detail Edit mode writes
   type/region/stage/status/account#/overview/contacts back to the note
   (`applyAccountEdit`, `POST /api/accounts/note`).
3. **Live contacts** (DONE 2026-06-18): contacts carry title + email + phone,
   editable in-app, shown as dropdowns in the Contacts tab. Parser + serializer
   updated. Follow-on: per-person `300 Merit/People/` notes (format not pinned).
4. **Account detail tabs** (SCAFFOLDED 2026-06-18): tab set is now Overview,
   Contacts, Quotes, Tasks, Open projects, Pricing, Quality, OEM PCNs, Meetings.
   Overview/Contacts/Tasks/Meetings are wired; Quotes / Open projects / Pricing
   / Quality / OEM PCNs are "coming soon" placeholders pending data sources
   (Quotes via the price list; Pricing/Quality/PCNs likely need new vault data
   or the DB).
5. **AI layer over the vault**: "informationalize" everything so the app can
   answer questions and act as the OEM team's reference brain. Likely a
   retrieval + `lib/ai` chat surface over the parsed vault. (Decide scope: ask
   over tasks/accounts/meetings first.)
6. **DB cutover**: once the above are trusted, the app becomes its own vault
   (Postgres already attached for email/queue) so it no longer depends on the
   Obsidian repo as the source of truth. Big architectural step; sequence last.

Open questions to resolve before building 3-6: contact model + where phone/title
live (account note vs `People/` notes vs DB); the "type of request" taxonomy is
v1 and may need Jordan's edits; Pricing/Quality/PCN data sources; AI scope and
provider (Claude per repo default).

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
