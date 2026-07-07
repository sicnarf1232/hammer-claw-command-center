# Changelog

One line per phase boundary: what shipped and any decisions made.

## Phase 3 — price agreements + ruleset importer (2026-07-07)

- **account_price_agreements**: per-account, per-part pricing with quantity
  tiers (min_qty), effective windows, and provenance (origin contract | legacy
  | negotiated | catalog-override; grandfathered = expires null + origin
  legacy; confirmed_by stamped; superseded_by chains replacements).
- **Importer as engine + rulesets**: upload CSV/XLSX, the fast model proposes
  a column mapping with per-field confidence, Jordan confirms or fixes it in
  the review UI, and the confirmed mapping saves as a named ruleset keyed by
  the header signature, so the next upload from the same source auto-applies.
  Account is a mappable column AND an upload-time picker; the picker wins.
- **Nothing is written without confirmation**: /api/import/commit is the only
  write path, it re-parses the stored file server-side, supersedes live
  same-tier rows, and records an import_batches audit row.
- /pricing page: agreements grouped by account with tier/expiry/origin and
  superseded/expired strikethrough. Engine pure + tested (243 total).

## Phase 2 — THE FLIP, step 8 of 8 (2026-07-07)

**The app database is now the source of truth.** Executed after Jordan ran
the diff/upsert seed, verified the flipped reads, resolved the review queue,
and confirmed the export round-trips ("vault export is solid").

- `VAULT_MODE` defaults to **readonly**: the only vault writer is the
  deliberate export (`writeFileForExport`); everything else throws
  `VaultReadOnlyError` at the single choke point. Set `VAULT_MODE=readwrite`
  to restore pre-cutover behavior in an emergency.
- Briefs are app-state now: full text in `app_settings` (`brief:<date>:<kind>`)
  and delivered in the notification body; no cron vault writes.
- Inbox "file" is a DB status change (the email row already holds the full
  message); the vault note copy is gone.
- CLAUDE.md rule 2 flipped in this same commit, per docs/DB-CUTOVER.md.
- Rollback story: the vault still holds everything as of the last export, and
  `git revert` of this commit + `VAULT_MODE=readwrite` restores the old world.

## Phase 2 — DB cutover, steps 1-7 of 8 (2026-07-07)

The app now reads accounts, people/roster, meetings, series, and tasks from
the DB once seeded (count-gated dual-read; vault fallback before that), and
every app write lands in the DB with `origin='app'` provenance. **Step 8 (the
VAULT_MODE readonly default + CLAUDE.md rule 2 flip) is staged but NOT
executed**; until then vault writes remain possible but app edits already
prefer the DB.

- **VAULT_MODE + one write choke point** in lib/github.ts; only
  `writeFileForExport` bypasses readonly. Provenance columns
  (origin/confirmed_by/superseded_by) on the five cutover tables.
- **Seed is a diff/upsert** (pure `planTable`, tested): only origin='seed'
  rows are updated/removed; app/proposal rows always survive; unchanged rows
  keep ids (firehose FKs stay valid). Critical fix folded in: the old seed
  imported only meeting action items; **getAllTasks (Jordan's real task list)
  now seeds too**, with the full vault task contract as new tasks columns.
- **Content-in-DB**: meeting and series rows store their full markdown; the
  existing parsers run on rows, so fidelity is identical. `source_path` is a
  stable identity; edits/reclassify update content + columns, never the path
  (the export computes placement).
- **Proposals execute into the DB** (origin 'proposal'), syncing Jordan's
  action items into tasks; series updates merge against a fresh DB read.
- **DB-first task creation**: POST /api/tasks/create, quick-add on /tasks,
  and a real create-task form in the thread composer (thread-linked via
  task_emails + task_meta). Identity rule keeps existing task_meta/day-plan
  keys with NO remap (seeded rows keep sourceFile:sourceLine; app rows use
  db:tasks:<id>). vault_tasks snapshot + sync-vault cron retired.
- **Who-is-who review queue** on /contacts (needsReview people; classify or
  dismiss via /api/people/review).
- **Deliberate export** (/api/export + Settings card): accounts render from
  DB (round-trip tested), meetings/series write stored markdown, app tasks
  render into one-writer Command-Center-Tasks.md, seeded task done-states
  flip in place, index rebuilds. Unchanged files skipped.
- **Quick wins** from the 2026-07-07 review: mark-done circle contrast;
  notification bell with unseen count.
- Tests 229 passing (30 files). Operator step before the flip: re-run
  `POST /api/cutover/apply {confirm:true}` so rows carry content + all tasks.

## Phase 1 — stabilize (2026-07-06)

Gating guarantee: **no AI output reaches the vault without approval, and
auto-stored triage is labeled with its true model.**

- **Triage provenance fixed**: `email_triage.model` now records the model the
  API actually served (was hardcoded to a Haiku string while Sonnet ran); old
  bugged rows backfilled to `unknown (pre-fix)`. New `ai_generated` +
  `ai_snapshot` columns: first manual correction freezes the AI's original
  values; TriageBar shows an AI chip until confirmed or corrected.
- **Propose-then-confirm for Granola** (new `lib/proposals/`): the pull stages
  `meeting-file` and `series-update` proposals (zero vault writes, cron-safe);
  a review queue on /meetings previews the exact note and executes approved
  payloads (contacts best-effort, series merged against a fresh doc read,
  index rebuilt once per batch). Rejected meetings never re-stage.
- **"Send update" really sends**: `/api/tasks/send-update` replies into the
  task's linked thread via Flow B (reply-all set derived server-side, pure +
  tested). Unlinked tasks keep an honest "Mark sent" stamp; recipients are
  never guessed (decision: require linking).
- **Build Your Day rollover** reads the server day plan (localStorage is only
  a fallback). ReplyBox workstream is a prop (merit default). Stale
  "Outlook draft" comments and dead `ReplyIntent` removed: Flow B is a direct
  send. `documents.spec` + `brand_kits` (with `paper`) now self-provision, so
  those two manual ALTERs left the punchlist.
- Tests 218 passing (27 files); first Anthropic mock pattern via typed
  factories (`lib/testing/aiMock.ts`) + `vi.mock("@/lib/ai")`.

## Phase 0 — verify (2026-07-06)

- Live-schema verification: `lib/schemaCheck.ts` (expected DDL assembled from every provisioning source, pure diff, FK summary, 9 tests) + read-only `GET /api/debug/schema` + operator script `scripts/check-live-schema.mts`. Local introspection is impossible by design (Sensitive Vercel vars pull blank), so the deployed endpoint is the verdict; Jordan runs it via `docs/VERIFY-LIVE.md` (new 5-minute checklist).
- Settled from `vercel env ls production`: `CRON_SECRET` is NOT set, so the two scheduled Hobby crons (morning-brief, notify) have never run (`isAuthorizedCron` fails closed). Needs Jordan: set `CRON_SECRET`. Also confirmed absent: `NOTIFY_WEBHOOK_URL`, `VAULT_MODE`, model overrides.
- CLAUDE.md synced to the HANDOFF-2026-07 decisions log: direct-send (not drafts), `/dashboard` default route, dark default, `task_meta` app-state pattern, nextech removal, middleware exemptions. Rule 2 ("markdown is truth") unchanged, now annotated with its scheduled DB-CUTOVER supersession.

## Main St. redesign — full 4-phase visual + feature rebuild (2026-07-06)

Executed `DESIGN_HANDOFF.md` straight through. See `docs/HANDOFF-2026-07.md` for
the exhaustive state, punchlist reconcile, data-layer status, and AI map.

- **Phase 1 — foundation:** Sea Glass palette + Söhne display face + dark default
  (`globals.css`, `tailwind.config.ts`, `layout.tsx`). Two-tier collapsible nav
  with mobile bottom bar (`Nav.tsx`). Inbox list reskin: 2-dot state, hover
  quick-actions (`/api/inbox/thread-action`), unmapped-sender treatment.
- **Phase 2 — pages:** New `/dashboard` (now the default route; root redirects
  here) with commits / inbox snapshot / accounts / rail + floating Ask bar.
  Today gains a "Build Your Day" planner tab (timeline, greedy plan-my-day,
  rollover). Tasks default to grouped-by-account with urgency + nudge bar +
  view toggle. Contacts rebuilt as relationship health (last-touch + reply
  badges derived from the firehose).
- **Phase 3 — inbox thread panels:** participant map, cross-customer playbook
  (`lib/firehose/playbook.ts`), attach-to-reply (`ReplyBox` + `/api/reply`),
  action composer "link to existing task".
- **Phase 4 — data layer:** `/api/day-plan` (server plan persistence),
  `/api/webhooks/calendar` + `/api/calendar/today` (calendar feed, flow-fed),
  `task_meta` table augmenting vault tasks (checklist / linked thread /
  last-customer-update), expandable task cards with urgency-toned AI "Send
  update" drafts (`draftCustomerUpdate`, Sonnet 5).
- **Nav logo fix:** the packaged `mainst-logo-*.png` are opaque 1254² square
  lockups; render the transparent mark + a type wordmark instead.

Decisions (full list in HANDOFF §6): default route → `/dashboard`; dark is
default; `task_meta` = DB-only app-state keyed by the vault task id (markdown
stays truth — the DB-CUTOVER "DB becomes truth" flip was NOT applied, cutover is
still Stage 1 / seed-only). Deferred (PUNCHLIST): HC Calendar Push flow, vault
task-create writeback, notification push channel.

## Inbox: folders, inline-attachment fix, smart panels (2026-07-01)

- Inline attachments: signature logos / embedded images no longer count as
  attachments (`lib/firehose/attach.ts` heuristic + isInline flag). Skipped at
  ingest, hidden at read, and a one-time backfill route
  (`POST /api/inbox/attachments-maintenance`) cleans mail stored before the fix.
- Folder rail: the inbox now has a left vertical folder list (Needs attention,
  Sent, Flagged, Reviewed, All, Archived + pathway folders Needs reply / Quotes /
  Quality-PCN / Logistics / FYI / Noise). Reviewed threads leave Needs-attention
  but live in their pathway folder, so a reviewed "needs reply" is your reply
  queue. Mobile shows the folders as horizontal chips.
- Smart Action panel: the thread view suggests related open tasks (account +
  keyword match, suggestion-only) beside the AI summary.
- Account suggestions: an unmapped sender gets a suggested account (by shared
  email domain); one tap links the contact + backfills their mail
  (`POST /api/inbox/link-sender`).

## Inbox daily-driver: read state, reply-all, manual triage (2026-07-01)

- Mark-as-read: opening a thread marks its messages read (`emails.read`); unread
  dots now reflect real read state instead of just status.
- Reply-all: the thread view computes the full recipient set (last sender in To,
  everyone else in Cc, Jordan excluded) and ReplyBox defaults to Reply-all when
  others were copied, with a toggle + a live recipient line. `/api/reply` now
  accepts to/cc.
- Manual triage (`TriageBar` + `POST /api/inbox/triage-set`): set a pathway
  yourself (Needs reply / Quote / Quality-PCN / Logistics / FYI / Noise) or "Mark
  reviewed" to clear a thread from Needs-attention. Manual triage latches
  (`email_triage.manual/reviewed`) so AI auto-triage never overwrites it; reviewed
  threads drop out of Needs-attention.
- Attachments: broadened the byte-field parser (ContentBytes / contentBytes /
  $content). NOTE: "not retained" means the Power Automate flow isn't sending the
  attachment bytes; fix is "Include Attachments = Yes" + map ContentBytes.

## Inbox intelligence: AI triage + summaries + brain over email (2026-06-30)

- Haiku auto-triage (`lib/ai.ts:triageEmailThread`, `lib/firehose/triage.ts`):
  each thread gets a one-line summary, a pathway (needs-reply / quote-request /
  quality-pcn / logistics / fyi / noise), a priority, and a needs-reply flag.
  Stored in a self-provisioned `email_triage` table keyed by threadKey, with a
  signature so it re-runs when a new message arrives.
- Smart Needs-attention: the tab now = flagged OR unmapped OR AI-says-needs-reply.
- Inbox rows show the AI summary (with a spark) + pathway/priority chips; the
  thread view shows an "AI summary" card with the pathway, priority, and a
  "you still owe a reply" hint. Triage runs post-hoc: the inbox client triages
  untriaged threads 6 at a time (`POST /api/inbox/triage`) then refreshes; opening
  a thread triages it on demand.
- Brain over email (`lib/firehose/brainSource.ts`): `/ask` now retrieves from
  real email bodies + attachment text, citable by thread (sequence F #4).
- Sequence F now: #1-4 + #6 done. Remaining: #7 Account/Contact Emails tabs.

## Mobile revamp + inbox facelift (2026-06-30)

- Responsive nav: the fixed 236px sidebar is now desktop-only. On mobile there's
  a sticky top bar (logo + hamburger) that opens a slide-in drawer with the full
  nav (backdrop, body-scroll lock, closes on navigate). Layout switched from a
  flex row to a fixed sidebar + `md:pl-[236px]` offset; tighter mobile padding.
- Inbox facelift (`components/InboxList.tsx`): premium mail-client look — sender
  avatars (initials + per-account hue), instant search, date grouping (Today /
  Yesterday / Earlier this week / month / older), unread dots, flagged accent
  bar, sent glyph, snippet preview, account/attachment/replied chips, segmented
  tab pills with counts. Thread summaries now carry a preview + newest-message
  direction + unread. Thread view header stacks on mobile.

## Milestone 4: unified inbox (Mailstream folded into Inbox) (2026-06-30)

- Decision (Jordan): merge Mailstream + the flagged Inbox into ONE thread-first
  surface so he can see full context and reply in one place. Matches roadmap
  section D ("the Inbox becomes thread-first").
- `/inbox` is now the single view over the firehose `emails` table: tabs Needs
  attention (flagged or unmapped) / Flagged / All mail, with live counts. Thread
  view at `/inbox/[key]` shows the full chain + attachments + Reply (Flow B, with
  AI draft) + Flag/Archive actions.
- The Outlook "flag" is no longer a separate queue: `/api/webhooks/email` (Flow A,
  unchanged URL/payload) now lands the message in the same `emails` table and sets
  `flagged=true` (added columns flagged/flaggedAt/status/repliedAt, self-provisioned).
  `email_queue` is retired (left dormant, not dropped).
- `/mailstream` now redirects to `/inbox`; removed from the Nav. `/api/reply` and
  the new `/api/inbox/action` (flag/archive) operate on the firehose emails.

## Milestone 4: email firehose live (ingest + Mailstream) (2026-06-30)

- New endpoint `POST /api/webhooks/email-firehose` receives every Merit OEM
  message (both Power Automate flows: capture received + capture sent). Verifies
  `x-hc-signature`, dedupes on internetMessageId, stores + links, returns 200.
  Separate from the flagged-triage webhook so it does not flood the action queue.
- Self-provisioning schema: the firehose creates/extends its tables on first call
  (`lib/firehose/schema.ts`, idempotent, no cross-table FKs) because the DB URL is
  a Sensitive Vercel var that can't be reached from local dev. Recorded as
  `drizzle/0005_email_firehose.sql` for the record. Extended `emails` (sentAt,
  recipients, bodyHtml, hasAttachments, needsReview) + new `email_participants`
  and `email_attachments`.
- Intelligent mapping (`lib/firehose/map.ts`): from/to/cc addresses resolve to
  `people` by email, person -> account; unknown senders get a people row flagged
  needsReview (reuses the cutover identity layer). Internal = @merit.com /
  meritoem.com. Account picked from the first external party that maps.
- Attachments stored to the PRIVATE Blob store, served via authed proxy
  `/api/email-attachments/file`; PDF text extracted for the brain (best-effort).
- New `/mailstream` page: thread-first list (grouped by conversationId, newest
  first, account + needs-review + in/out + attachment chips) and a thread chain
  view at `/mailstream/[key]` (interleaved messages, attachments inline). Added
  to the Nav.
- Still to come in sequence F: brain retrieval over emails, post-hoc Haiku triage
  + pathways, and the Account/Contact Emails tabs.

## Typography: Merit Type Style Guide (Outfit + Inter) (2026-06-30)

- Adopted the Merit Type Style Guide (imported from the Claude Design project
  "Outfit and Inter font guide"). Two families, one system: **Outfit** carries
  display (headings, eyebrows, all-caps; weights 400-900), **Inter** carries
  body & UI (weights 300-700). Colors were intentionally left unchanged per
  Jordan's direction (font-only update).
- Fonts load via `next/font/google` in `app/layout.tsx` (self-hosted, no layout
  shift), exposed as `--font-inter` / `--font-outfit` and mapped in globals.css
  onto `--font-sans` (Inter), `--font-display` (Outfit), `--font-mono` (system).
  Removed the old SN Pro `@font-face`.
- Base layer: h1-h4 now use the Outfit display face (800, tight tracking); body
  inherits Inter app-wide. `.eyebrow` matches the guide (Outfit 800 / +0.10em /
  uppercase). New `.display-title` utility + `font-display` Tailwind family for
  the branded uppercase screen-title treatment, applied to the static page
  titles and the Nav wordmark. Dynamic titles (account/person/meeting names)
  keep normal case but inherit Outfit.

## Quote builder: stacked preview, contacts, speech, recent quotes, re-edit (2026-06-30)

- Layout: the live preview now stacks full-width below the editor (was a right
  rail), so the input sections get the full width and you scroll down to the
  preview.
- Contacts: the quote is linked to the account, so the contact field offers that
  account's contacts (datalist) and auto-fills the first when the account is
  picked. Page passes account contacts.
- Parse box: added speech-to-text (MicButton, Web Speech API) for dictation, a
  mode guide (Auto / Structured / Free-form), and a "what to include" guide
  (title vs detail/attribute lines vs the bold sterility line).
- Recent quotes: a "Recent quotes" panel grouped by week (This week / Last week
  / Week of <Mon>), newest first, each with an Open-PDF link. New
  GET /api/quote/recent.
- Re-edit + overwrite: saved quotes now persist their full QuoteSpec (new
  documents.spec column), so clicking a recent quote re-opens it in the builder.
  Saving a quote with the same id for the same account OVERWRITES the stored
  version (revision), instead of erroring/duplicating. Reads/writes degrade
  gracefully if the spec column is not present yet.
- NEW SQL TO RUN (Neon) to enable re-edit:
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS spec jsonb;
- Noted for later: a global app-wide brain mic (bottom-right) is not built yet.

## Private Blob store support (2026-06-30)

- The Vercel Blob store is configured private, so the hardcoded access:"public"
  upload failed ("Cannot use public access on a private store"). Private is the
  right call for confidential customer documents (quotes, specs), so:
  - Documents now upload with access:"private" and are served through a new
    authed proxy, GET /api/documents/file?id= (the app is behind APP_PASSWORD),
    which streams the private blob via the SDK. The library links there instead
    of at the raw (non-public) blob URL. Added getDocument + openDocumentBlob.
  - Brand logos now store inline as a data URL instead of a public blob: a logo
    must be embeddable in the meeting/quote email + PDF (loadable by Outlook and
    headless Chromium), which a private blob URL is not.

## Meeting-notes export: Outlook-safe HTML (2026-06-30)

- Outlook strips display:flex / inline-block / CSS custom properties on paste, so
  the meeting/series copy-for-email template was collapsing to stacked blocks and
  losing colors. Reworked the shared template (lib/meetingTemplate.tsx) to use
  only Outlook-safe primitives: tables, plain block divs, inline spans, and
  literal &#92;u00A0 for spacing.
  - Stat row (People/Open/Closed/Decisions) is now a <table> (one <td> per stat
    at equal width, thin spacer <td>s), card styling kept on each <td>.
  - Attendees render <span>INITIALS</span>&nbsp;<span>Name</span>, with three
    nbsp between people; initials are first+last word (lib/customerHues) so they
    always match the name.
  - Section headers get two nbsp between the number badge and title (was
    "01KEY DECISIONS"); ◆ / ! bullet markers get a nbsp before their text.
  - Action-item checkbox is now a span prefix inside the same div as the text
    (was a preceding block that split onto its own line in Outlook).
  - Every var(--brand-x, #hex) is emitted as the literal hex (docTheme), and
    all flex/inline-block removed template-wide (footer, sessions, chips, lists).
- 191 tests pass (meeting-template test updated to assert the Outlook-safe
  output); verified by rendering the email HTML.

## Quote save + account Quotes tab (2026-06-29)

- Quotes can now be saved and are linked to their account. New "quote" document
  type; the account Quotes tab is enabled and renders the DocumentLibrary scoped
  to that account + the quote type, so it both lists saved quotes and accepts
  past-quote uploads (drag a PDF in). This reuses the same store as the Quality
  / OEM PCN tabs (needs POSTGRES_URL + BLOB_READ_WRITE_TOKEN).
- Builder gets a "Save to account" button: POST /api/quote/save renders the same
  PDF as Download and stores it as a quote document against the customer/account
  (title = quote id). Render logic factored into lib/quote/renderPdf.ts, shared
  by /api/quote/pdf and /api/quote/save (both added to the Chromium tracing list
  + 1536MB in vercel.json).
- Note: a quote shows on the account when its document type is "Quote" and its
  account matches the account name. Re-save from the builder or re-tag an earlier
  upload as "Quote" to surface it.

## Quote redesign follow-ups: prod PDF fix, formatting, task connectivity (2026-06-29)

- Fix: the quote PDF 500'd on Vercel ("@sparticuz/chromium/bin does not
  exist") because the new route was not in the binary tracing list. Added
  `/api/quote/pdf` to `outputFileTracingIncludes` (next.config.mjs) and a
  1536MB/60s function entry (vercel.json), matching the meetings PDF route.
- Price display rule (`formatPrice`): under $100 always two decimals ($16.50,
  $4.00); $100 and over drop a ".00" ($100, $41,200) but keep real cents
  ($1,234.50); always thousands separators. Applied in the document render.
- Quantity (`formatQuantity`): keeps volume-pricing notation, "5000+" ->
  "5,000+", ">5000" -> ">5,000", "1000-5000" -> "1,000-5,000".
- Date is now a calendar picker defaulting to Today (ISO internally, a "Today"
  reset button when changed).
- Parser no longer clobbers manually entered fields: it merges (only fills
  empty meta fields) and appends parsed line items.
- Connectivity: tasks now have a "Create quote" action (TaskDetail) that deep
  links to /quote prefilled with the customer + task text; the quote page reads
  customer/contact/desc/parse search params as a seed. Customer field is wired
  to vault accounts (datalist + linked-account / new-account indicator).
- Layout: input is a fixed left rail, the live preview is wider and taller.

## Quote redesign: Merit OEM quotation document + data layer (2026-06-29)

- Rebuilt the quote generator around the "Merit Medical OEM Quote Redesign"
  handoff. Five layers: (1) typed data model + business logic in `lib/quote/`
  (quote-id derivation, customer/contact normalization, category->acronym tag
  map, sterility inference, default lead times, leadTimeSummary composition,
  quantity formatting, title derivation); (2) parsers, a deterministic
  "Line Item N" key-value parser (`parseStructuredQuote`) and a free-form
  English LLM parser (`parseQuoteFreeform` in `lib/ai.ts`, Haiku) that both
  funnel through one `normalizeQuote`; (3) the document render, `lib/quote/
  quoteHtml.ts` emits the multi-page Merit-red letterhead/logo/signature
  document with an estimation-based paginator that reproduces the reference
  3/2/closing split, assets embedded as data URIs in `lib/quote/assets.ts`;
  (4) a rewritten `QuoteBuilder.tsx`, price-list add with sterility/lead
  inference, custom items, paste-to-parse, per-row edit panels with Custom/Ask
  badges, live preview iframe, validation, localStorage drafts; (5) routes
  `POST /api/quote/pdf` (headless Chromium, same pipeline as meetings),
  `POST /api/quote/html` (preview), `POST /api/quote/parse`.
- Decisions: PDF render moved from pdf-lib to the Chromium HTML->PDF pipeline
  (retired `lib/quotePdf.ts`); output is download-only for now (vault save
  deferred); both parser formats shipped. Verified by rendering the Balt
  reference to a faithful 3-page PDF locally. 221 tests pass (31 new).
- Deferred (see PUNCHLIST): auto quote-tag suggestion from the line-item
  category mix needs category metadata on catalog items; saving the PDF into
  the vault at 300 Merit/Meetings/{customer}/{quoteId}/.

## Phase 3 polish: brand-in-app, paper colors, auto-download PDF (2026-06-25)

- Branding now reflects in the in-app meeting/series view too: ONE `docTheme(brand)` themes all three surfaces (in-app, email, PDF), so the colors, paper, and logo are sticky and consistent. The note body adopts the brand; the app chrome (toolbar, classifier) stays on the app theme. (Replaced the split appDocTheme/clientDocTheme.)
- Paper / texture choices: brand kits gain a `paper` background (white, cream, ivory, sand, parchment + dark slate/charcoal/navy). Ink (text, borders, surfaces) auto-derives from the paper's luminance via `paperInk()` so the note reads well on light or dark. New `paper` column on brand_kits (drizzle/brand-kits.sql adds it; ALTER is idempotent).
- Logo across the top of the document (in all three views), kept also as a footer bookend.
- Compact email header: date · account · topic collapse into one byline instead of stacked rows, so the copy is far less tall.
- Auto-download PDF: the Download button now fetches a real PDF rendered server-side from the same shared HTML via headless Chromium (@sparticuz/chromium + puppeteer-core), no print dialog. Falls back to the print view if the PDF route errors. `serverExternalPackages` set so Vercel traces the Chromium binary.
- Self-review fixes: section index uses the accent color (matches the preview legend); branding setup errors (missing table or paper column) show a clear "run brand-kits.sql" notice.

## Phase 3 PART B: Branding settings page + Merit seed (2026-06-24)

- New `/branding` page + `POST/GET /api/branding`: list kits, create/edit a kit (name, workstream, primary/secondary/accent color pickers with hex inputs, logo upload), with a live export preview that mirrors the PDF/email look. `listBrandKits()` + `upsertBrandKit()` (upsert by id, else by the unique workstreamKey). Added to the left nav.
- Logo storage: pushed to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, else stored inline as a data URL in `brand_kits.logo_url` (the page tells you which). Decision unchanged from the punchlist.
- `ensureMeritSeed()` runs on page load so the Merit kit exists to edit; set the crimson palette + upload the Merit logo there and the exports pick it up by workstream. Needs `POSTGRES_URL` (the page shows a setup notice until then).

## Phase 3 PART A step 2: Download PDF from the shared HTML (2026-06-24)

- The Download PDF button now opens `GET /api/meetings/print?note=|series=`: a standalone, app-chrome-free HTML document of the SAME shared template (client-branded), with `print-color-adjust: exact` and an auto-`window.print()`, so you Save as PDF. The PDF is literally the shared HTML, so it cannot drift from the in-app view or the email copy.
- Decision: no headless Chromium (heavy + fragile on Hobby) and no separate pdf-lib layout. Retired `lib/meetingPdf.ts`, `lib/meetingShare.ts`, `POST /api/meetings/pdf`, and their tests (pdf-lib stays for quotes). One loader `buildShareHtml()` now backs both the email-copy route and the print route. Closed actions render expanded (`<details open>`) in print.

## Phase 3 PART A step 1: one shared meeting/series template (2026-06-24)

- New `lib/meetingTemplate.tsx`: ONE themed document (`DocModel` content + `DocTheme` tokens + the `MeetingDoc` component) renders the in-app meeting/series detail AND the Copy-for-email export, so they cannot drift. Sections: brand eyebrow (`MERIT MEDICAL OEM · MEETING/ROLLING NOTES`, replacing the old "FILM ROOM" eyebrow), title, meta, team-colored people chips (with rolling N× on series), stat cards, brand-tinted TL;DR callout with a brand left-border, action-item cards (Jordan's checkable + synced via source line; other owners tracking-only with a due pill), collapsible closed actions, decision/number/watch sections, full-notes, footer with the brand line + logo slot.
- Two-layer branding: the in-app view uses the APP semantic tokens (`appDocTheme`, so dark mode + the palette keep working); exports use the resolved CLIENT brand (`clientDocTheme(resolveBrandKit(workstream))`, fallback APP_NEUTRAL) themed via `brandToCssVars` as `var(--brand-x, #literal)` so it colors even in mail clients that strip custom properties. The rest of the app UI is untouched.
- Decision: Next's App Router bans `react-dom/server` anywhere in its build graph, so the export HTML is produced by a tiny element-tree serializer in `lib/meetingExport.tsx` (the `MeetingDoc` element tree -> string). One template, no `react-dom/server`. The email HTML is served by `POST /api/meetings/share-html` and prefetched by `MeetingShareButtons` so the clipboard write stays in-gesture.
- `app/meetings/page.tsx` meeting + series detail refactored onto `MeetingDoc` (interactive bits injected via slots: `TaskRow`, `PersonLink`, About links, session links). (+ `lib/meetingTemplate.test.ts`.)
- Next: step 2 makes the Download PDF render from this same HTML (today `lib/meetingPdf.ts` still uses the separate pdf-lib layout).

## Cutover Stage 1 apply + series header + parser fix (2026-06-23)

- Cutover: `applySeed` writes the reconciled vault into the DB (idempotent reload of the cutover tables only); `POST /api/cutover/apply` (gated on POSTGRES_URL + confirm). Runs once the DB is provisioned.
- Bug fix: meeting notes with emoji section headings (`## 📌 TL;DR`, `## ✅ Action Items`, `## 🎯 Key Decisions`) parsed empty and dropped their action items — the parser keyed on the raw heading. Now strips the leading emoji so sections, TL;DR, and action items parse. (+test.) This was the "empty notes" on e.g. New Sales Ops Role Offer.
- Series detail redesigned: a stat band across the top (people involved with rolling N× attendance, sessions, items open, items closed, decisions logged, latest date), then the Rolling TL;DR, then open action items (interactive) + a collapsible closed list, then the clickable meetings. `getSeriesView` now also returns attendance/action/decision stats and the closed items.
- Suggested-series cross-customer warning now fires only for 2+ distinct customers (Internal + a customer is normal, no warning).
- Dates render as "June 23, 2026" on the meeting note.
- Main meetings list is a month accordion: newest month expanded, older months collapsed (click to open).

## Series UX: deny suggestions, preview members, restructured detail (2026-06-23)

- Suggested series are now expandable: "Review" shows the member meetings with dates (clickable to open each), a cross-bucket warning, and a "Not a series" deny that persists (browser localStorage) so bad clusters clear out. Create moved behind the review step.
- Series detail restructured: Outstanding items (tasks) listed first, Latest status condensed into a collapsible block, and "Meetings in this series" below with each session clickable through to its source note (`getSeriesView` resolves each log entry's Source link). 
- A meeting note's internal label now reads "Internal · Merit" (the meeting type stays "internal" on the list/series).
- Meetings list now shows every meeting (not the 30-row index) via `getAllMeetings`.

## Contacts directory + team color-coding (2026-06-22)

- Color-code people by side: attendee / owner / participant chips are now colored by roster classification (internal team vs customer contact), with a browser-saved palette selector to match branding (defaults: internal red, customer blue). `components/BrandColors` (localStorage context + swatch selector); `PersonLink` takes a `kind`.
- New Contacts directory (`/contacts`, added to the nav): everyone in the vault grouped into Internal team and Customers (collapsible per account), each name linking to their `/people` profile. Houses the team-color selector.
- 142 tests pass, typecheck + production build clean.

## Meetings: account creation, owner=attendee, full reclassification (2026-06-22)

- Create accounts inline (#1): the link control offers "Create new account", which scaffolds `300 Merit/Customers/<Name>.md`, links the meeting, and drops you on the new account page to fill in details. `createAccount` in `lib/writeback`.
- Owner counts as attendee (#2): a task owner is treated as a meeting attendee everywhere the app reads, collapsing short names into the matching full-name attendee (owner "Jordan" folds into attendee "Jordan Francis"). In-app only, no files rewritten; person profiles also count owned-item meetings as attended.
- Full reclassification (#3): changing a meeting's account/internal now propagates (fixes the bug where only the frontmatter changed). `reclassifyMeeting` sets the customer link + H1 ` -- Account` suffix, moves the note into the correct folder (customer folder, or Internal when cleared), and rebuilds the meetings index so the list name, badges, and links all follow. Adds `deleteFile` to the github client and `setMeetingTitleAccount` (tested); the classifier follows the note to its new path.
- 142 tests pass, typecheck + production build clean.

## Meetings Phase 3+4: people pages, classifier, hot/stats (2026-06-22)

- People (#4): names are now interactive `PersonLink` chips (subtle hover zoom + a mini contact card showing their company) that click through to a new `/people/[name]` page aggregating their company (roster), the action items they own across all notes, and the meetings they attend. Wired into meeting attendees, series participants, and action-item owners. `getPersonProfile` + pure `personNameMatches` (`lib/vault/people.ts`, tested). Reassigning an owner is still done via Edit mode (deferred a dedicated inline reassign).
- Link/internal classifier (#2b, #3): an inline control on the meeting note sets or clears the `customer:` link (mark internal), via a surgical frontmatter-only write (`setMeetingCustomer`, tested) behind `POST /api/meetings/classify`. Fixes "internal discussion about a customer" getting parsed as a customer meeting, and lets you link unlinked notes without full edit mode. (Note: this changes the frontmatter link, not the note's folder.)
- Hot + stats (#7): the All view now opens with a "Jump back in" quick-reference (5 most recent meetings) and a "By the numbers" panel (totals, this month, busiest customer, pace/week, top series) instead of the customer tile rail. Approximated from recency/activity, no visit tracking.
- 139 tests pass, typecheck + production build clean.

## Series: detect recurring meetings + one-click create (2026-06-22)

- New "Suggested series" on Meetings → Series: scans every meeting note file (not just the 30-row index), clusters recurring meetings by a normalized title key (2+ meetings on 2+ distinct dates), and excludes anything an existing series already covers. Against the live vault it surfaces the 7 real recurring series; Mike/Nick are filtered out (they already have docs). `lib/vault/seriesDetect.ts` (+tests).
- One-click create: auto-places the new rolling-series doc by bucket (`300 Merit/Meetings/<bucket>/Rolling`), scaffolds frontmatter + emoji headings, then folds each existing matching meeting in oldest to newest using the same `updateSeries` AI summarizer the Granola pull uses, committing one new file. `lib/vault/seriesCreate.ts` (+tests), `lib/createSeries.ts`, `POST /api/series`, `components/SuggestedSeries.tsx`. Inert until the user clicks Create.

## Meetings Phase 1+2: task sync, linked badges, rolling-series overhaul (2026-06-22)

- Task checkoff inside a meeting note now uses the same `TaskRow` as the Tasks view; both write the one markdown checkbox by source file + line, so they stay 1:1. Tracking-only (other-owner) items stay read-only.
- Linked-account badge: a green check next to a company on the meetings list when its bucket matches a real account, and on the note page (links to the account; shows a hollow circle when the customer is set but unmatched).
- Views reordered to All, Customers, Series, Month (default All). KPI boxes no longer clip cadence/date values. Meeting + series detail widened from max-w-3xl to max-w-5xl.
- Rolling-series overhaul: two-column note-style layout, Latest status rendered as real markdown (bold, bullets, wikilinks), and an Outstanding items list that pulls incomplete Jordan action items forward from the series' source meetings (deduped, checkable inline and synced). `getSeriesOutstanding` in `lib/vault/index.ts`.
- 130 tests pass, typecheck + production build clean.

## Fix — rolling-series notes vanished on emoji headings (2026-06-22)

- Bug: a rolling-series doc whose section headings carry an emoji (`## 📍 Current State`, `## 📅 Meeting Log`, as in the real `Nick 1on1.md`) rendered with zero sessions and an empty TL;DR. The series still listed (from frontmatter) but "none of the actual notes" showed. Cause: the parser matched headings starting exactly with the keyword, so the emoji prefix made it skip both sections. `Mike 1on1.md` (plain headings) was unaffected, which masked it; fixtures also used plain headings.
- Fix: `lib/vault/series.ts` now matches any `##` heading that contains the keyword (`isH2Named`), applied to reading Current State, parsing the Meeting Log, and both pull-time write-back helpers (so future Granola pulls update the emoji sections in place, not append duplicate H2s). Verified against the live Nick doc: 0 → 3 sessions, full Current State restored. 114 tests pass (3 new emoji-heading regression tests), typecheck clean.

## Phase 0 — Scaffold + vault on the web

- Next.js (App Router) + TypeScript strict + Tailwind scaffold; builds clean, no type errors.
- `lib/github.ts`: single Octokit client. Reads via Git Trees + Contents API (vault-relative paths, root-prefix owned here), writes via commits with latest-SHA read-before-write, never force-push.
- `lib/vault/`: pure, typed parsers with unit tests against the docs/02 fixtures: frontmatter, tasks (bracket-balance scan handles nested `[[wikilinks]]` inside inline fields), roster (Team Overrides applied last), meetings (dual-capture action items), meetings index, wikilinks. 22 tests pass.
- `/today`: read-only list of open tasks due today or overdue, computed in Mountain Time (`America/Denver`) so it matches Obsidian. Renders title, customer, due, priority, workstream, source file.
- Single-user auth: shared-secret middleware + `/login`. Enabled only when `APP_PASSWORD` is set; otherwise the app is open so Vercel password protection can be used instead.
- Decision: the app is developed at `~/dev/hammer-claw-command-center` because macOS blocks spawned `node`/`next` processes from `~/Documents` (TCC). The repo can live anywhere; this only affects where the working copy sits. See PUNCHLIST.
- Stub/needs-Jordan: `GITHUB_TOKEN` + `VAULT_REPO` to see live data (PUNCHLIST).

## Phase 1 — The email keystone

- Vercel Postgres (Neon) + Drizzle. Tables: `webhook_events`, `email_queue` (unique on messageId for dedupe), `notifications`, plus `vault_tasks` (parsed snapshot), `quote_drafts`, `app_meta`. Migration `drizzle/0000_*.sql` generated; apply with `npm run db:push`.
- `POST /api/webhooks/email` per docs/03: constant-time `X-HC-Signature` check, dedupe on messageId (insert onConflictDoNothing), raw event logged (header secret never stored), enqueue status `new`, log an in-app `new_email` notification.
- `/inbox`: lists the queue, suggests workstream + likely account by recipient identity, sender domain, and roster lookup (deterministic, no AI), and files into the correct workstream `Inbox/` via a GitHub commit (`app: file <from> email <date>`). Sloan/shared have no inbox folder so filing refuses and asks (rule 5). Dismiss archives without filing.
- Vault index sync: `GET /api/cron/sync-vault` (CRON_SECRET-gated) rebuilds the `vault_tasks` snapshot from the live vault; `/today` reads the snapshot when present, else live GitHub. `vercel.json` schedules it every 10 minutes.
- The app degrades gracefully without `POSTGRES_URL`: pages show a setup notice instead of crashing.
- Stub/needs-Jordan: `POSTGRES_URL`, `HC_WEBHOOK_SECRET`, Power Automate Flow A, M365 HTTP-action license check, `ToHC` folder confirm (PUNCHLIST 3 and 4). Every-10-min cron needs a Vercel plan that allows sub-daily cron.

## Phase 2 — Reply + draft

- `lib/ai.ts`: Anthropic SDK (`@anthropic-ai/sdk`), default model `claude-opus-4-8` (override via `ANTHROPIC_MODEL`). Drafts reply bodies and (Phase 4) briefs. House-style guarded: prompt forbids em dashes and inventing facts, plus a post-process that strips any em dash. Optional: without `ANTHROPIC_API_KEY` the app skips AI and Jordan writes the body.
- `lib/powerAutomate.ts` + `POST /api/reply`: two modes. `generate` returns an AI draft for Jordan to edit; `draft` posts a `create_draft` intent to Flow B (`POWER_AUTOMATE_REPLY_URL`) to create an Outlook draft as Jordan. Auto-send is not exposed: the app only ever creates drafts. From-identity comes from the chosen workstream; sloan/personal/shared have no sending address so drafting refuses and asks (rule 5).
- `/inbox` Reply panel: optional AI instructions, Draft with AI, editable body, Create Outlook draft. Signature block built per workstream identity.
- Decision: per the claude-api guidance, defaulted the model to `claude-opus-4-8` (was sonnet in the first env template).
- Stub/needs-Jordan: `ANTHROPIC_API_KEY`, Power Automate Flow B + `POWER_AUTOMATE_REPLY_URL`, Sloan from-address (PUNCHLIST 5 and 6).

## Phase 3 — Meetings + quotes

- `/meetings`: reads `100 Periodics/Meetings-Index.md` (the single source of truth), resolves each `[[basename]]` to a file under the Meetings folders, and renders a meeting with attendees colored Merit vs customer from the roster, plus dual-capture action items (Jordan's items show priority/customer/due; others render as tracking only). Live from the vault, no snapshot.
- `/quote`: parses the Merit price list (`300 Merit/Price List/`) into a catalog (tolerant markdown-table parser, unit-tested), lets Jordan assemble line items with part-number autocomplete and manual entry, and downloads a Merit OEM branded PDF rendered server-side with `pdf-lib` (`POST /api/quote/pdf`). No em dashes in the PDF text.
- 24 parser tests pass (added price-list parser tests).
- Decision: the price-list schema is not pinned in docs/02. The parser reads any markdown table and maps Part/Description/Cost columns by header name; if the real format differs, it is the one place to tighten. Flagged in PUNCHLIST.
- Open question for Jordan: confirm the price-list file format and whether a Merit logo asset should be embedded in the PDF (PUNCHLIST).

## Phase 4 — Cron + notifications

- Vercel Cron (`vercel.json`): morning brief (12:30 UTC), notify (13:00 UTC), EOD recap (23:30 UTC), weekly review (Fri 22:00 UTC), Granola pull (every 4h), vault sync (every 10 min). Times target Mountain Daylight Time; brief content always uses `America/Denver` dates.
- `lib/briefs.ts`: assembles a context blob from the live vault (due/overdue tasks, top open tasks, today's meetings), generates the brief via AI when `ANTHROPIC_API_KEY` is set, otherwise writes a deterministic vault-snapshot fallback so briefs still run. Writes to `100 Periodics/Daily|Weekly/` as a git commit and logs a notification. All cron routes are `CRON_SECRET`-gated.
- `lib/notify.ts` + `/notifications` (Activity): every notification is logged to Postgres; the notify cron creates an idempotent daily "N tasks due today" and delivers unsent notifications (including the new-flagged-email ones logged on webhook) to `NOTIFY_WEBHOOK_URL` if set, else in-app only.
- Granola pull is stubbed behind `GRANOLA_API_KEY` pending the endpoint contract: no-op when unset, logs a clear "not implemented" notice when set.
- Stub/needs-Jordan: `NOTIFY_WEBHOOK_URL` (external push channel), `GRANOLA_API_KEY` + endpoint contract, Vercel plan for sub-daily cron, DST handling (PUNCHLIST 7).

## Live verification + repo

- Created and pushed `sicnarf1232/hammer-claw-command-center` (private).
- Verified the spine against the live vault (using a temporary read token): `/today` rendered Jordan's real open tasks from `100 Periodics/Daily/TASKS.md` dated 2026-06-11; `/meetings` parsed 30 meetings from `Meetings-Index.md`; `/quote` loaded 1144 parts from the price list; `POST /api/quote/pdf` returned a valid Merit OEM PDF.
- Confirmed `VAULT_ROOT` is blank (vault markdown is at the repo root).
- Fix: price-list header matching is now keyword-based so real headers (`Part#`, `High Price`) map correctly (was returning an empty catalog). 25 parser tests pass.

## Deployed to production

- Live at https://hammer-claw-command-center.vercel.app (Vercel project under "jordan's projects"), GitHub-connected so `git push` to main auto-deploys.
- Verified live: logged in through the app password gate and `/today` rendered the real vault tasks as of 2026-06-11 (Phase 0 DoD met on the live URL).
- Production env set: GITHUB_TOKEN, VAULT_REPO, VAULT_BRANCH, APP_TIMEZONE, APP_PASSWORD.
- Two deploy-time fixes: upgraded Next.js to 15.5.19 (Vercel blocks the older version's security advisory; relevant to the auth middleware), and reduced `vercel.json` to two daily crons for the Hobby plan (full schedule preserved in `vercel.cron-pro.json`).
- Follow-ups (PUNCHLIST 8): rotate the GitHub PAT (it was shared in chat), add the database + remaining secrets, restore full crons after a Pro upgrade.

## Phase 1 wiring — webhook keystone live (2026-06-12)

- Neon Postgres store confirmed attached in Vercel (all `POSTGRES_*` vars present; URLs are marked sensitive so they do not pull locally).
- Set `HC_WEBHOOK_SECRET` in production env and redeployed so the webhook stops returning 503.
- Verified the live `POST /api/webhooks/email` end-to-end (docs/03 test plan steps 1-2): 401 on bad signature, 400 on missing messageId, 200 `{ok:true,deduped:false}` on a full payload (the successful insert proves `email_queue` + `webhook_events` + `notifications` tables exist), 200 `{ok:true,deduped:true}` on a repeat (unique-index dedupe). One synthetic test row left in the queue for Jordan to dismiss.
- Confirmed with Jordan: the generic HTTP action is available on his M365 plan, so Flow A uses HTTP (no relay fallback).
- Remaining for a fully lit inbox: Jordan builds Power Automate Flow A (trigger + HTTP POST with the secret) and flags one real email to confirm it lands in `/inbox`.

## Phase 2 wiring — reply send path live (2026-06-16)

- `ANTHROPIC_API_KEY` set in production; "Draft with AI" verified live. (First save was mis-cased `Anthropic_API_Key` and 503'd; env var names are case-sensitive.)
- Decision change: Jordan wants the app to SEND replies directly, not create a draft (the standard Outlook connector has no create-draft action anyway). Flow B is now trigger -> "Send an email (V2)" on the Merit connection, mapping `to`/`subject`/`bodyHtml`. An earlier threaded build (Get emails -> Condition -> Reply/Send) had empty branches and silently sent nothing; simplified to a single send step. Replies go as a fresh "RE:" email, not in-thread.
- Flow B trigger auth: the new Power Platform request trigger defaulted to OAuth-required (`DirectApiAuthorizationRequired`, 401). Switched to the SAS/URL scheme so the app calls it tokenless; `POWER_AUTOMATE_REPLY_URL` set in production.
- UI relabeled to match reality: "Send reply" / "Reply sent" (was "Create Outlook draft").
- Removed the nextech workstream from the app entirely (type, identity table, classification, inbox picker, chip/accent). App now knows merit, sloan, personal, shared. Vault-contract docs still describe the `400 Nextech/` folder; scrubbing those is a separate decision.
- Verified end-to-end: a self-addressed test email -> app "Send reply" -> delivered to the Merit inbox.

## Fix — GitHub rate-limit blowout (2026-06-16)

- Symptom: the live app returned "API rate limit exceeded for user ID ..." (the authenticated 5,000/hour GitHub limit). Root cause: `getAllTasks` reads every markdown file in the vault as an individual blob call (~979 of 1058 files), and every page had `revalidate = 0`, so each `/today` or `/tasks` view cost ~981 GitHub calls. Roughly five page loads exhausted the hourly budget.
- Fix in `lib/github.ts`: cache blob reads by SHA (content-addressed, so immutable) in the Next Data Cache with `revalidate: false`; a changed file arrives under a new SHA and misses naturally. The branch+recursive-tree listing is cached 60s behind `vault-tree`, and `writeFile` calls `revalidateTag('vault-tree')` so commits (task complete, account number) show immediately. After warm-up a full-vault render costs ~2 GitHub calls instead of ~981. `getFile` (read-by-path, used before write-back) stays uncached for write correctness.
- Verified: typecheck clean, 28 parser tests pass, production `next build` clean.

## Feature — Granola pull (Path A: in-app button) (2026-06-17)

- New "Pull from Granola" button on `/meetings` (and the now-live `granola-pull` cron) pulls recent Granola meetings into the vault in one press. Shared implementation in `lib/meetingsPull.ts`.
- `lib/granola.ts`: single Granola public-API client (`https://public-api.granola.ai`, Bearer `GRANOLA_API_KEY`). `listNotesCreatedAfter` (cursor pagination, page_size 30) + `getNote`. Window self-adjusts: pulls notes created after the newest date already in `Meetings-Index.md` (last 30 days on an empty index).
- AI triage (`triageMeeting` in `lib/ai.ts`): each note's title, attendees (classified merit/customer via the roster), Granola folders, and summary plus the known-account list go to Claude, which returns workstream + account + bucket + a structured TL;DR / Notes / Decisions / dual-capture action items. Jordan's action items get the inline field row so they surface as real tasks; others stay tracking-only.
- `lib/meetingFormat.ts` (pure, unit-tested): renders the docs/02 meeting note (frontmatter incl. `granola_id` + `source: granola-pull`), computes the `<workstream>/Meetings/<Account>/YYYY-MM-DD - Title.md` path (unknown account stages under `300 Merit/Meetings/_Unfiled`), and upserts the index table newest-first, deduped by basename, capped at 30. Dedup across the vault is by basename against the SHA-cached file tree, so re-pulls are safe.
- Route `POST /api/meetings/pull` (behind the app password gate, `maxDuration` 300) and the cron both 503/skip cleanly without `GRANOLA_API_KEY` or `ANTHROPIC_API_KEY`. 11 new mapper tests (39 total). Typecheck + production build clean.
- Needs Jordan: confirm `GRANOLA_API_KEY` is set in Vercel (done), then press the button on the live `/meetings` and spot-check filing. Triage filing is best-effort and editable in the vault.

## Polish — canonical meeting format (Meeting Notes App Handoff) (2026-06-17)

- Adopted Jordan's refined meeting-note format from the "Meeting Notes App Handoff" spec for both the Granola pull output and the `/meetings` viewer. Sections, in order: TL;DR, Action Items, Key Decisions, Numbers That Matter, Watch-Outs, Full Notes (with `###` subsections). Optional sections are omitted when empty; TL;DR and Action Items always render. Added a `**Topic:**` meta line (+ `topic` frontmatter, now parsed and shown).
- `triageMeeting` now returns the full structured shape (topic, tldr, actionItems, decisions, numbers, watchouts, fullNotes[{subsection,text}]) instead of a flat notes blob, so meetings come in already organized.
- Fixed a latent bug: the viewer looked for a `Decisions` section, but real notes (and the spec) use `Key Decisions`, so decisions never rendered. The viewer now renders the canonical set, with subsection-aware Full Notes. Title H1 carries a ` - <Account>` suffix (plain hyphen, house style).
- Kept dual-capture action items (Jordan's items keep the `[due:: ]` field row that feeds /today and /tasks); others now also get a plain indented `Due:` line per the spec. 40 tests pass (4 new), typecheck + build clean.
- Not yet built from the handoff (proposed follow-ons): rolling-series notes (Current State + Meeting Log), the by-customer and hub views, and the config-driven taxonomy/series/people surface.

## Feature — rolling-series notes (2026-06-17)

- Rolling-series notes per the handoff spec (SPEC section 5): a living doc per recurring meeting with a pinned Current State and a reverse-chronological Meeting Log. Series docs live at `<workstream>/Meetings/_Series/<id>.md` and carry their own `matchRules` in frontmatter, so the doc is the config: drop one in and the pull maintains it. No separate config file needed.
- `lib/vault/series.ts` (pure, 9 unit tests): `parseSeriesDoc` (incl. nested `matchRules`/`participants`), `matchesSeries` (conservative, SPEC section 5: a clear title signal matches; an attendee-only signal requires a tight participant set so a group meeting that merely includes the person is not mistaken for their 1:1), and `applyMeetingToSeries` (prepend the log entry, rewrite Current State, stamp `updated`, preserve frontmatter verbatim).
- Pull integration (`lib/meetingsPull.ts`): each filed meeting is matched against the vault's series docs; on a match the note's `series` is set, then `updateSeries` (AI, in `lib/ai.ts`) produces 3-5 log bullets and a rewritten Current State (carry forward open threads, retire resolved, no action-item restatement), and the series doc is committed. In-pull updates stack (a second matching meeting builds on the first). Surfaced in the pull result and the button UI.
- Rolling-series view on `/meetings`: a "Rolling series" chip row links to a series detail (Current State pinned, then the Meeting Log). `getSeriesList` / `getSeriesByPath` added to the vault module.
- 49 tests pass (9 new), typecheck + build clean. To activate a series, add one `_Series/<id>.md` doc with `matchRules` (a template is in the handoff sample).

## Realign — match the real vault conventions (2026-06-17)

- Discovery: Jordan's live vault already runs a Granola->vault pipeline (Cowork triage) producing the canonical format, with rolling-series docs at `<...>/Meetings/.../Rolling/` (not `_Series/`), frontmatter `type: Rolling Series` + `series` name + `participants` + `tags` (no `matchRules`), and meeting notes using a `**Bucket:**` meta line, ` -- ` separators, and plain `- [ ] Owner: task` action items with `🗓️ Due:` lines (no dual-capture). Decision: the app becomes the single pipeline and replaces Cowork; realign the code to these exact conventions.
- Series: `SERIES_DIR_MARKER` is now `/Rolling/`. `parseSeriesDoc` reads the `series` field as the name and derives `matchRules` from participants + a 1:1 name when none are present, so existing docs match with zero edits. `applyMeetingToSeries` is now surgical: it replaces only the Current State block and prepends the log entry (em-dash `### MM/DD — Title` heading to match), preserving the H1, frontmatter, and existing entries byte-for-byte; only `updated` is restamped.
- Meeting render: title `Title -- Account`, a `**Bucket:** <bucket> · <topic>` meta line, plain action items with `🗓️ Due:`, and frontmatter trimmed to the vault's set (no `topic`/`source`/`granola_url`). The meeting parser now reads the topic from the Bucket/Topic body line. Dedup stays by date+title basename, which bridges the old UUID `granola_id` and the new `not_` API ids.
- 52 tests pass (incl. a real-vault-shape series doc with derived matchRules), typecheck + build clean.
- Operational (Jordan): to avoid two writers on the same files, retire the Cowork Granola-triage scheduler once the app pull is trusted (PUNCHLIST). The app and Cowork both write meeting notes, `Meetings-Index.md`, and the rolling docs.

## Feature — meetings Hub + dedup hardening (2026-06-17)

- Pull window is now exclusive of the newest indexed day (`isoStartOfDayAfter`, with a Mountain-Time cushion), so re-pulls can never re-fetch a day already filed and cannot recreate duplicates even when an existing note carries a different title or id (the transition-from-Cowork failure mode). Trade-off: no intra-day incremental pull, which fits the daily EOD workflow.
- `/meetings` is now a Hub (`components/MeetingsHub.tsx`): a view toggle (By date / By month / By customer), client-side search across title/bucket/date, a freshness line (count + newest date), and meeting-type labels (Customer · <Account> vs Internal). Runs entirely off the index rows, no extra vault reads. Rolling-series chips and the meeting/series detail views are unchanged.
- Not yet built from the handoff Hub spec (need per-note reads): attendee bubbles colored by team and the cross-meeting action-item rollup.

## Phase C — editable meeting notes (2026-06-17)

- In-app editor for a meeting note that writes back to the vault as one commit. Reached from a meeting's detail view via an "Edit" button (`/meetings?note=...&edit=1`). Edits: title, account, bucket/topic, attendees (chip add/remove with a roster datalist), TL;DR, the optional sections (Key Decisions, Numbers That Matter, Watch-Outs, Full Notes), and the action items. This is the surface that clears the Phase-A `[due:: TBD]` flags by setting a real date, reassigns attendees and owners, and edits sections.
- `lib/meetingEdit.ts` (pure, 15 unit tests): `meetingNoteToEditable` builds the editor model from a parsed note (strips the ` -- Account` title suffix; maps action items, preserving Jordan's inline fields and the TBD flag). `applyMeetingEdit` rewrites the markdown: frontmatter is preserved byte-for-byte except the app-managed `attendees`/`customer` fields; the body is re-emitted in canonical section order; any non-canonical section is preserved verbatim, appended after the canonical block. Jordan's action items keep the `[customer:: ]/[created:: ]/[priority:: ]/[due:: ]` field row (so /today and /tasks pick them up); an emptied due falls back to `TBD` so it stays a flag. Tracking-only items render with a `🗓️ Due:` line.
- `editMeetingNote` in `lib/writeback.ts` (mirrors `completeTask`): reads latest, applies the pure transform, commits `app: edit meeting note <name> <date>` through `lib/github.writeFile` (busts the vault-tree cache so the change shows at once). No-op edits skip the commit.
- Route `POST /api/meetings/note` (behind the app password gate) validates the path is a meeting note and coerces the edit payload defensively. Client editor is `components/MeetingEditor.tsx` (server `EditMeeting` builds the model + roster/account datalists; on save it POSTs, returns to the read-only view, and refreshes).
- The meeting parser now exposes a `due` on every action item (Jordan's from `[due:: ]`, tracking-only from the `🗓️ Due:` line, `(confirm)` stripped) so the editor can show and set it. 71 tests pass (15 new + 4 parser), typecheck + production build clean.
- Note: re-serializing drops the `(confirm)` hint from tracking-only dues the user didn't touch (the editor now lets them confirm/set the due directly).

## Phase C follow-up — broaden the due-date flag (2026-06-18)

- Fix: the `⚑ needs due date` flag only rendered for Jordan's dual-capture items whose due was literally `TBD`. Real notes pulled before Phase A are plain `- [ ] Owner: task` + `🗓️ Due:` (no field row), so every item parsed tracking-only and vague dues like "Next week" never flagged. `needsDueDate()` in `lib/dates.ts` (true when due is missing, TBD, or non-ISO) is now shared by the read-only view and the editor, and applies to all items. The editor also gained a "feeds /today (mine)" toggle to promote a tracking item to a real task. 73 tests.

## Phase D — Film Room PDF + copy-for-email (2026-06-18)

- Branded **Film Room PDF** of a meeting note or a rolling series, for email sharing, plus a **"Copy for email"** button that puts a clean inline-styled HTML version on the clipboard (rich `text/html` with a plain-text fallback). Reached from the meeting/series detail header. PDF is the primary path.
- `lib/meetingShare.ts` (pure, 3 tests): a normalized `ShareDoc` model with `meetingToShareDoc` / `seriesToShareDoc`, so meeting and series share one layout engine, plus `renderMeetingEmailHtml` (escaped, em-dash-free, due-flag aware).
- `lib/meetingPdf.ts` (2 tests): `buildMeetingPdf(doc)` via `pdf-lib` (same dependency as the quote PDF). Multi-page flow with a running footer and page numbers, accent rule + section headings + diamond bullets + checkbox action items with due/flag tags. All text is sanitized to the WinAnsi range the standard fonts can encode, so emoji (🗓️), smart quotes, and em dashes can't crash generation (verified by a unicode/emoji smoke test and a pagination test).
- Route `POST /api/meetings/pdf` (app-password gated) takes `{ path }` or `{ seriesPath }`, reads + parses, and returns `application/pdf`. Client `components/MeetingShareButtons.tsx` does the blob download and the clipboard copy.
- 78 tests pass (5 new), typecheck + production build clean. Verified a sample PDF renders the full note (pdftotext confirms all content, house style preserved).
- Not built (proposed): embed a real Merit/Film Room logo asset in the PDF header (currently a typographic wordmark); a server-rendered HTML preview route.

## Accounts page — adopt the Film Room master-detail design (2026-06-18)

- The "reconcile to the Claude Design" pass only updated the meetings screens; the Accounts page was still the older grid + separate `/accounts/[slug]` route. Rebuilt `/accounts` as the master-detail layout from the handoff (`docs/design/Film Room Preview.dc.html`, lines 242-378): a searchable/filterable account list (All / Open tasks / Overdue) on the left, and a tabbed detail pane (Overview / Contacts / Meetings) on the right with an avatar header, the account-number editor, a radial flourish, and stat tiles.
- `getAccountsHub()` in `lib/accounts.ts` assembles everything in one server pass (account notes + the cached task scan + the meetings index): per-account open tasks, overdue counts, and recent meetings (matched to an account by index bucket, then by the `/Meetings/<Account>/` path segment). Selection is client-side (`components/AccountsHub.tsx`), so switching accounts is instant; `?a=<slug>` deep-links a selection. Reuses `AccountNumberEditor` (writes the account number back to the vault) and the per-customer hue palette.
- Data-driven deferrals (noted, not built): the Pricing tab (no per-account negotiated pricing exists yet, only the global 1,144-part list) and the "+ Log activity" write action; contact phone numbers are not in the vault. The old `/accounts/[slug]` route still works for deep links; the unused `AccountsGrid` component was removed.
- 78 tests pass, typecheck + production build clean.

## Phase B — attendees → contacts (auto-create) (2026-06-18)

- Resolve a meeting's attendees against its account's existing contacts + the roster, and **auto-create** the missing customer/external ones as contacts on the account note. Two entry points: a "Sync contacts" button on the meeting detail (shown when an account is assigned), and automatically during the Granola pull for every filed meeting that has an account.
- `lib/contacts.ts` (pure, 3 tests): `resolveAttendees(attendees, accountContactNames, roster)` classifies each attendee (merit/customer/unknown via the same roster as Phase A), marks `alreadyContact`, and sets `willCreate` for external attendees (customer or unknown) that are not yet on the note. Merit-internal people (team) and the user (Jordan) are never filed as customer contacts.
- `lib/contactsWrite.ts` (pure, 6 tests): `addContactsToNote` surgically appends `- **Name**` bullets into the account note's contacts section ("Key contacts" / "Contacts" / "Key Contacts"), creating the section if absent, deduped by normalized name. The account parser reads the additions straight back.
- `addAccountContacts` in `lib/writeback.ts` (one commit, idempotent); `findAccountByName` in `lib/accounts.ts` maps a meeting's account to its note. Route `POST /api/meetings/sync-contacts`; client `components/SyncContactsButton.tsx`. The pull now reports `contactsAdded` (surfaced in the Pull from Granola result).
- Contact store decision (per the roadmap open question): contacts stay in the vault (account-note contacts + the roster), no DB table. Not built: parsing `300 Merit/People/` person notes into the directory (their note format is not pinned in docs/02), and contact phone/email capture from attendees (Granola gives names, not emails).
- 87 tests pass (9 new), typecheck + production build clean.

## Tasks page — sortable/filterable table, de-cluttered (2026-06-18)

- Rebuilt `/tasks` from the grouped list into a data table: rows are tasks; columns are Task / Account / Type / Status / Start / Due. Click a header to sort; filter by search, workstream, account, type, and status. Check a row off to complete it in the vault (`/api/tasks/complete`).
- De-clutter: the scan still reads the whole vault, but `/tasks` now derives each task's workstream from its folder path (`workstreamFromPath`), drops Nextech entirely, and defaults the workstream filter to Merit (Sloan/Personal reachable via the filter). This removes the Nextech/personal noise the old view showed.
- New "Type of request" column: `lib/taskType.ts` (pure, 3 tests) classifies each task by keyword into an OEM set (PCN, Quality & Reg, Pricing/Quote, Samples/Dev, Supply/Logistics, Commercial, Admin/Other) so tasks can be sorted by which team function to engage. There is no such field in the vault, so it is derived; it can be refined later. `TaskView` now also carries `start` (scheduled ?? created).
- `TaskList`/`TaskRow` are unchanged and still power `/today` and the account detail. 90 tests pass (3 new), typecheck + production build clean.
- Larger requests captured in the roadmap (see CONNECTIVITY-ROADMAP "Milestone 2"): editable accounts + live contacts (phone/title/email), the expanded account tabs (Quotes / Tasks / Open projects / Pricing / Quality / OEM PCNs), an AI layer over the vault, and the eventual DB cutover so the app becomes its own source of truth.

## Milestone 2 #2 + #3 — editable accounts + live contacts (2026-06-18)

- Accounts are now editable in-app. The account detail pane has an Edit mode (`AccountEditor` in `components/AccountsHub.tsx`) for Type, Account #, Region, Stage, Status, Overview, and the full contacts list (add/edit/remove). Save writes one commit to the account note via `POST /api/accounts/note` → `editAccountNote` → `applyAccountEdit`.
- Contacts are first-class: name + **title + email + phone**. The contacts parser (`lib/vault/accounts.ts`) extracts title/email/phone from each bullet; the serializer writes `- **Name** — Title · email · phone`. `AccountContact` gained `title`/`phone`.
- Contacts tab renders each contact as a **dropdown** (`ContactDropdown`): the header row expands to show title, email (mailto), and phone (tel). The Overview "primary contacts" list shows the title.
- `lib/accountEdit.ts` (pure, 8 tests): `applyAccountEdit` surgically edits the managed frontmatter fields, replaces the Overview body, and rebuilds the contacts section (creating it if absent); everything else in the note is preserved. Round-trips through the parser.
- Account detail tabs expanded to the requested set: Overview, Contacts, **Quotes**, **Tasks**, **Open projects**, **Pricing**, **Quality**, **OEM PCNs**, Meetings. Tasks is wired (per-account open tasks); Quotes/Open projects/Pricing/Quality/OEM PCNs are clearly-labeled "coming soon" placeholders pending data sources.
- 95 tests pass (8 new + parser), typecheck + production build clean.

## Tasks expandable rows + contacts roster-filter (2026-06-19)

- Tasks table rows are now clickable: a row expands in place to show the task's full description, notes, priority/workstream/thread chips, and source file. The title stays the simple parsed title (inline `[field:: ]` residue stripped); the detail lives in the expander. The complete checkbox and account link stop propagation so they do not toggle the row.
- Fix: Merit co-workers were showing as customer contacts on accounts (e.g. teammates listed under Intuitive). The vault roster already classifies people by org, so `customerContacts(contacts, roster)` in `lib/accounts.ts` drops anyone the roster classifies "merit"; unknown people stay (treated as external). Applied in both `getAccountsHub` and `getAccountBySlug`, so the Contacts tab/dropdowns and the legacy detail route only show real customer contacts. Editing an account then rewrites the note without the misfiled teammates. (2 new tests; the Phase B auto-create already excluded Merit people.)
- 97 tests pass (2 new), typecheck + production build clean.

## Milestone 2 #5 — the brain (AI over the vault) + app polish (2026-06-19)

- New **Ask** page (`/ask`, in the nav): a chat that answers questions about the Merit OEM world grounded in the live vault (accounts, contacts, open tasks, meetings). It cites the accounts/meetings it drew from and says when something is not in the vault rather than inventing.
- `lib/brain.ts`: assembles a bounded, grounded context (compact account roster + open Merit tasks + recent meetings) and does keyword retrieval to pull the bodies of the most relevant meeting and account notes. `pickRelevant` (pure, 4 tests) ranks by question-keyword overlap with stopword filtering. `answerVaultQuestion` in `lib/ai.ts` (Opus, house style, ONLY-from-context system prompt, light conversational memory). Route `POST /api/ask` (app-password + AI gated); client `components/AskBrain.tsx` with suggestion chips and source tags. Degrades to a clear setup notice without `ANTHROPIC_API_KEY`.
- Polish/fixes shipped alongside: a global route-loading skeleton (`app/loading.tsx`) so GitHub-backed pages feel responsive during navigation; a global error boundary (`app/error.tsx`) so a transient vault read failure shows a recoverable card with "Try again" instead of a blank screen; removed the hardcoded fake "4" inbox badge in the nav.
- 101 tests pass (4 new), typecheck + production build clean.

## Brain — pricing + vault-wide scan (2026-06-19)

- The brain now answers **pricing** questions. When a question is about pricing or names a part, `assembleBrainContext` pulls matching parts from the same Merit price-list catalog the quote builder uses (`getCatalog`) and includes "your price". `isPricingQuestion` + `matchCatalog` (pure, tested): a part-number token matches highest, description keywords add.
- The brain now does a **vault-wide note scan**, not just the structured types. `scanVaultNotes` reads the rest of the vault (Projects, People, Sales Ops, Periodics, memory, etc., excluding noise + the already-structured Customers/Meetings/Price List/Nextech) and includes the most relevant snippets. `bestSnippet` (pure, tested) finds the densest keyword window and strips frontmatter. So info buried anywhere in markdown becomes answerable.
- 108 tests pass (7 new), typecheck + production build clean.
- Bigger vision captured in the roadmap (Milestone 3 — Knowledge ingestion): a document library (ISO docs, biocomp, drawings) and meritoem.com ingestion, so reference material lives in the brain instead of email. Needs a storage + extraction decision (see roadmap).

## Accounts polish + Milestone 3 #1 — document library (2026-06-19)

- Contacts fix (round 2): Merit teammates were still appearing on accounts when the roster did not list them. `isMeritContact` now also drops anyone with a Merit email domain (merit.com / meritoem.com / merit.net). Contacts redesigned as a card grid: avatar + name, role line, labeled Email/Phone, and free-text detail as its own "Notes" block instead of a parenthetical. The global container widened to 1360px and the accounts master-detail uses it (wider sticky list, taller scroll) so fields are no longer smushed/cut off.
- Document library (Vercel Blob + Postgres index, both confirmed). New `documents` table (`drizzle/0001_furry_odin.sql`). `lib/documents.ts`: upload to Blob, best-effort PDF text extraction (`unpdf`), index in Postgres, list/delete, and `matchDocuments` (pure, tested). Tag taxonomy: ISO / Biocompatibility / Drawing / Certificate / OEM PCN / Spec sheet / Other. Route `POST|GET|DELETE /api/documents`; client `components/DocumentLibrary.tsx`.
- Surfaces: a global **Library** page (in the nav) for upload/browse across accounts; the account **Quality** tab (ISO/biocomp/cert/drawing/spec) and **OEM PCNs** tab (pcn) are now real, document-backed tabs scoped to that account. The brain (`/ask`) retrieves the most relevant documents' extracted text, so uploaded reference material is answerable and cited.
- Degrades cleanly: without `BLOB_READ_WRITE_TOKEN` + `POSTGRES_URL` the library shows a setup notice instead of crashing. Provisioning + migration steps in PUNCHLIST.
- 111 tests pass (3 new), typecheck + production build clean (one benign `unpdf` import.meta warning; extraction is lazy-loaded).
