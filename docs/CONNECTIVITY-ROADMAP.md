# Connectivity Roadmap — meetings ↔ tasks ↔ accounts ↔ contacts

## ▶ PICKUP — start here next session

Last worked: 2026-06-30. HEAD = `cdedc2f` on `main`, pushed, working tree clean.
Deployed at https://hammer-claw-command-center.vercel.app. Infra now provisioned:
`POSTGRES_URL` (Neon) + a PRIVATE Vercel Blob store (`BLOB_READ_WRITE_TOKEN`).
The `documents` table exists. Document library + account Quotes/Quality/PCN tabs
are live. Models: Opus 4.8 (`claude-opus-4-8`) main, Haiku 4.5 fast (no env
override). LLM = Anthropic only.

Shipped 2026-06-29/30 (see CHANGELOG): full Merit OEM quote redesign (data layer
`lib/quote/*`, structured + Haiku free-form parsers, multi-page Merit-red PDF via
shared Chromium `lib/quote/renderPdf.ts`, builder `QuoteBuilder.tsx` with live
preview, price-list add, custom items, paste/dictate, validation, drafts);
save-to-account + account Quotes tab; private-Blob support (docs served via authed
proxy `/api/documents/file`, logos inline as data URLs); Outlook-safe meeting
copy-for-email (tables/nbsp/literal colors); quote UX (red header default,
free-form default, collapsible sections, recent-quotes-by-week + re-edit/overwrite).

### PENDING — one SQL you (Jordan) run in Neon to finish quote re-edit
`ALTER TABLE documents ADD COLUMN IF NOT EXISTS spec jsonb;` then Save a quote
once. Until then Recent quotes is view-only (PDF link). Code degrades gracefully.
(Tracked in PUNCHLIST. The app already overwrites a quote on re-save by id.)

### NEXT BIG BUILD → Milestone 4: Email firehose → Merit OEM brain (below)
Read "Milestone 4" in this file. Two Power Automate flows (all received + all
sent) POST every message to a new ingest endpoint; the app stores, links to
contact+account+thread, indexes for the brain, and post-hoc triages. The inbox
is redesigned for high volume (threaded chains, attachments/images). The
Power Automate build PROMPT for Claude-in-Chrome is embedded in Milestone 4.

## Milestone 4 — Email firehose → Merit OEM brain (captured 2026-06-30)

Jordan's direction: stop ingesting only flagged email. Route the ENTIRE Merit
OEM mailbox (all inbound AND all outbound) through the app so it reads, learns,
and builds a data-layer brain. Scope is "truly everything" because this is a
single-purpose app on Jordan's Merit OEM mailbox only, so everything = Merit
only. READ-ONLY learning (no auto-send). Decisions resolved: everything,
read-only, retain all.

### A. Capture (Power Automate, not Graph directly — keep the guardrail)
- Flow 1 "All received": trigger "When a new email arrives (V3)", Inbox incl.
  subfolders. Flow 2 "All sent": trigger "When a new email arrives (V3)" on the
  Sent Items folder (or "When an email is sent"). Both POST the full message to a
  NEW firehose endpoint, NOT the flagged-triage webhook, so the firehose does not
  flood the manual queue. Existing Flow A (flagged -> action queue) stays.
- Auth: header `x-hc-signature: HC_WEBHOOK_SECRET` (reuse the existing secret).
- New endpoint to build app-side: `POST /api/webhooks/email-firehose`. Verify
  signature, dedupe on internetMessageId, store, return 200 fast. Payload (JSON):
  `{ direction: "inbound"|"outbound", internetMessageId, conversationId,
     subject, fromName, fromEmail, to:[{name,email}], cc:[...], sentAt (ISO),
     bodyText, bodyHtml, hasAttachments, attachments:[{name, contentType,
     contentBytesBase64, sizeBytes}] }`.

### B. Storage + intelligent mapping (the data layer)
- Use/extend the existing `emails` table as the firehose store (NOT email_queue):
  add direction, conversationId (thread), internetMessageId (unique),
  fromEmail/fromName, toJson, ccJson, sentAt, bodyText, bodyHtml, hasAttachments,
  accountId (nullable), needsReview. New `email_attachments` table: emailId,
  fileName, contentType, isImage, blobUrl (private), sizeBytes, extractedText.
  New `email_participants` (or reuse people): link each message to people rows by
  email address; a person belongs to an account => message links to contact AND
  account AND thread. So we can query: all emails for a contact, for a customer,
  and the full thread by conversationId.
- Mapping is intelligent: match from/to/cc addresses to `people` (by email, then
  name), people -> account; unknown senders -> create a people row flagged
  needsReview so Jordan can confirm/merge (reuse the people identity + aliases
  layer from the DB cutover). Internal (@merit.com / meritoem.com) = internal.

### C. Post-hoc triage (gather first, decide pathway after)
- Ingest EVERYTHING immediately (cheap store + link). Triage is a SECOND pass,
  not a gate: a classifier (Haiku) runs on a schedule or on-open and assigns a
  pathway/labels (needs-reply, FYI, quote-request, quality/PCN, logistics, noise)
  + priority, writing back to the email row. The flagged Flow A queue remains the
  explicit "act on this now" path; the firehose builds the brain underneath.

### D. Inbox redesign (high volume)
- `/inbox` becomes thread-first: list conversations (by conversationId), newest
  activity first, grouped/filterable by account, contact, pathway, unread.
- Open a thread => full chain (inbound+outbound interleaved), each message
  expandable, with attachments + inline images viewable (served via the authed
  private-blob proxy; PDFs/images inline, others download). Per-contact and
  per-account email history surfaced on those pages too (Account > Emails tab,
  Contact > Emails).

### E. Brain integration
- Index email bodyText + attachment extractedText for `/ask` retrieval (same
  pattern as documents), scoped/citable by account, contact, and thread. Every
  message enriches the brain (Milestone 3 #4 continuous retention).

### F. Build sequence (app side, after the flows exist)
1. Schema: extend `emails`, add `email_attachments`, participant links (drizzle
   migration + idempotent SQL for Neon). 2. `POST /api/webhooks/email-firehose`
   (verify, dedupe, store, link, store attachments to private Blob, extract text).
   3. Mapping lib (address -> contact -> account; needsReview). 4. Brain: include
   emails in `lib/brain.ts` retrieval. 5. Inbox redesign (threads + attachments).
   6. Post-hoc triage classifier (Haiku) + pathways. 7. Account/Contact Emails
   tabs. Privacy: single-user app behind APP_PASSWORD; blobs private; read-only.

### G. POWER AUTOMATE BUILD PROMPT (paste into Claude-in-Chrome)
Give Claude-in-Chrome this prompt to build the two flows in Power Automate:

```
You are building Microsoft Power Automate cloud flows for me in the browser.
Context: I have a Next.js app ("Hammer Claw Command Center") that ingests my
Merit OEM email to build a knowledge brain. It exposes a webhook that accepts
every received and every sent email. Build TWO automated cloud flows in my
Power Automate (Office 365 Outlook connector on my Merit OEM mailbox).

Shared:
- Endpoint (HTTP POST): https://hammer-claw-command-center.vercel.app/api/webhooks/email-firehose
- Header: x-hc-signature: <I will paste the HC_WEBHOOK_SECRET value>
- Header: Content-Type: application/json
- Send the FULL body and attachments. Do not filter or summarize.

FLOW 1 — "HC: capture received":
- Trigger: Office 365 Outlook "When a new email arrives (V3)".
  Folder: Inbox, Include Attachments = Yes, Include subfolders if available.
- Action: HTTP POST to the endpoint with this JSON body (map dynamic content):
  {
    "direction": "inbound",
    "internetMessageId": <Internet message id>,
    "conversationId": <Conversation id>,
    "subject": <Subject>,
    "fromName": <From name>, "fromEmail": <From>,
    "to": <To>, "cc": <Cc>,
    "sentAt": <Received time>,
    "bodyText": <Body (as plain text if available)>,
    "bodyHtml": <Body>,
    "hasAttachments": <Has Attachment>,
    "attachments": <Attachments array: for each, include Name, ContentType,
                    ContentBytes (base64), Size>
  }

FLOW 2 — "HC: capture sent":
- Same as Flow 1 but trigger on the SENT ITEMS folder (use "When a new email
  arrives (V3)" with Folder = Sent Items, or the closest available trigger that
  fires on messages I send), and set "direction": "outbound".

Requirements:
- Include attachments as base64 (ContentBytes) so the app can store and read them.
- Keep both flows simple, reliable, and low-cost; no Graph API, connector only.
- After building, tell me exactly how to paste the HC_WEBHOOK_SECRET into the
  HTTP header and how to test each flow with one real email.
- If "When a new email arrives (V3)" cannot target Sent Items, propose the best
  supported alternative for capturing sent mail and build that instead.
```

### Resume note
After building the flows, the app side is built in the order in F above. The
firehose endpoint must dedupe on internetMessageId and return 200 quickly
(store + link can be light; attachment text extraction can be deferred/async).

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
