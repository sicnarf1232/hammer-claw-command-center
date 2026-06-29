# Connectivity Roadmap — meetings ↔ tasks ↔ accounts ↔ contacts

## ▶ PICKUP — start here next session

Last worked: 2026-06-29. HEAD = `ba8b726` on `main`, pushed, working tree
clean. Deployed at https://hammer-claw-command-center.vercel.app.

Confirmed working 2026-06-29:
- Meeting/series PDF: click Download goes straight into a real downloaded PDF
  (server-side headless Chromium route), no print dialog. The in-flight Chromium
  binary tracing fix (`ba8b726`) is verified done.
- GitHub PAT rotated and `GITHUB_TOKEN` updated in Vercel.

Most recent build work: Phase 3 — branding (in-app/email/PDF themed via one
`docTheme`, paper colors, `/branding` page + Merit seed) and the meetings PDF.
See CHANGELOG for details.

### FIRST: two activation steps for the document library (Milestone 3 #1)
The library is built and live but shows a setup notice until these are done
(both need secrets that cannot be set from the agent):
1. **Link a Blob store** (sets `BLOB_READ_WRITE_TOKEN`). Interactive, answer Y
   then Enter to accept all envs:
   `npx vercel blob create-store film-room-documents --access public --scope jordans-projects-255badbb`
   (No store exists yet; earlier orphans were cleaned up.)
2. **Create the `documents` table**: apply `drizzle/0001_furry_odin.sql` in the
   Neon/Vercel Postgres query editor, or `npm run db:push` where `POSTGRES_URL`
   is set. (`POSTGRES_URL` is sensitive and does not pull locally.)
   After both: redeploy so the token takes effect, then upload a PDF on
   `/library` and confirm `/ask` can answer from it. Tracked in PUNCHLIST.

### Done (Milestone 2 — the Merit OEM brain) + Milestone 3 #1
- **Tasks** (`/tasks`): sortable/filterable table (Task/Account/Type/Status/
  Start/Due), Merit-default scope, Nextech dropped, derived OEM "type", rows
  expand to full detail. `components/TasksTable.tsx`, `lib/taskType.ts`.
- **Accounts** (`/accounts`): master-detail, editable (type/region/stage/status/
  account#/overview/contacts → one commit), live contacts (title/email/phone) as
  cards, Merit teammates filtered out (roster + `@merit.com` email). Tabs:
  Overview, Contacts, Quotes*, Tasks, Open projects*, Pricing*, Quality, OEM
  PCNs, Meetings (* = placeholder). `AccountsHub.tsx`, `lib/accountEdit.ts`,
  `lib/accounts.ts:customerContacts`.
- **Ask / the brain** (`/ask`): grounded chat over accounts/contacts/tasks/
  meetings + pricing (quote catalog) + a vault-wide note scan + the document
  library. `lib/brain.ts`, `lib/ai.ts:answerVaultQuestion`, `POST /api/ask`.
- **Library** (`/library`): upload/browse docs (Blob + Postgres + PDF text);
  account Quality/OEM PCNs tabs are document-backed. `lib/documents.ts`,
  `components/DocumentLibrary.tsx`, `POST|GET|DELETE /api/documents`.
- Polish: global `loading.tsx` + `error.tsx`; removed the fake inbox badge.

### NEXT candidates (pick one)
- **Wire the remaining placeholder tabs**: Quotes (from the price-list catalog,
  most data-ready), then Pricing / Open projects (need data sources).
- **Brain takes actions**: create/complete tasks, draft from a meeting; stream
  responses. (`/api/ask` is currently read-only.)
- **Milestone 3 #2**: meritoem.com ingestion (cron + WebFetch into the doc/
  knowledge index). #3: promote inbox attachments into the library.
- **Phase E — series as first-class**: widen detection, account on a series,
  cross-session rollup.
- **Milestone 2 #6 — DB cutover**: app becomes its own source of truth.

### Open follow-ons / decisions
- Pricing/Quotes/Open-projects tab data sources (Quotes can use the catalog).
- Contact emails: Granola gives names, not addresses (auto-created contacts are
  name-only until enriched). `300 Merit/People/` note format not pinned.
- Operational: retire the Cowork Granola scheduler once the app pull is trusted
  (one writer per file). Existing meeting notes predate Phase A (tracking-only);
  only future pulls get the dual-capture/flag format.
- House style everywhere: no em dashes in generated output.

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
5. **AI layer over the vault** (DONE 2026-06-19): the `/ask` brain. Grounded
   chat over accounts/contacts/tasks/meetings (`lib/brain.ts` retrieval +
   `answerVaultQuestion`). Pricing (the quote catalog) and a vault-wide note
   scan added 2026-06-19. Follow-ons: let it take actions (create/complete
   tasks, draft from a meeting) and stream responses.

## Milestone 3 — Knowledge ingestion (the growing brain) (captured 2026-06-19)

Jordan's vision: the app should retain and surface reference material so it stops
being buried in email and becomes widely reusable. Pieces, with the decisions
each needs:

1. **Document library** (DONE 2026-06-19): Vercel Blob (files) + Postgres
   `documents` index + best-effort PDF text extraction (`unpdf`). Tag taxonomy
   ISO / biocomp / drawing / cert / PCN / spec / other. Global `/library` page +
   account Quality and OEM PCNs tabs (document-backed, scoped to the account) +
   brain retrieval over extracted text. Needs a Blob store provisioned +
   `npm run db:push` (PUNCHLIST). Follow-on: promote inbox attachments into the
   library; a dedicated per-account Documents tab beyond Quality/PCNs if wanted.
2. **Website ingestion (meritoem.com)**: fetch key pages on a schedule, extract
   text, store as knowledge the brain can cite. A cron + WebFetch pipeline into
   the same knowledge store, refreshed periodically. DECISION NEEDED: which
   pages/sections matter most (products, capabilities, quality/cert pages).
3. **Email-sourced knowledge**: the inbox keystone already lands email in the
   app; let valuable attachments/threads be promoted into the document library so
   reference material is captured at the point it arrives.
4. **Continuous retention**: every ingest (pull, upload, fetch, email) adds to
   the index, so the brain gets richer over time. Pairs with the Milestone 2 #6
   DB cutover (the index is the start of the app being its own source of truth).

Sequence note: #1 (document library) is the foundation and unblocks the rest.
Start there once the storage/extraction decision is made.
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
