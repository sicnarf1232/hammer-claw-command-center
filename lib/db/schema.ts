import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Postgres holds ONLY fast-changing state that should not live in git
// (docs/01). The vault markdown remains the source of truth.

// Raw inbound webhook events, for audit/debug. Secrets are never stored here.
export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  messageId: text("message_id"),
  signatureValid: boolean("signature_valid").notNull().default(false),
  kind: text("kind").notNull().default("email"),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// The live email queue: one row per flagged email, with triage state.
export const emailQueue = pgTable(
  "email_queue",
  {
    id: serial("id").primaryKey(),
    messageId: text("message_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    toAddrs: jsonb("to_addrs").$type<string[]>().default([]),
    cc: jsonb("cc").$type<string[]>().default([]),
    subject: text("subject"),
    bodyPreview: text("body_preview"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    webLink: text("web_link"),
    // Triage: new | filed | replied | archived
    status: text("status").notNull().default("new"),
    // Classification (suggested, editable in /inbox)
    workstream: text("workstream"),
    account: text("account"),
    // Fill / reply outcomes
    filedPath: text("filed_path"),
    filedCommit: text("filed_commit"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Dedupe on messageId.
    messageIdUx: uniqueIndex("email_queue_message_id_ux").on(t.messageId),
    statusIdx: index("email_queue_status_idx").on(t.status),
  }),
);

// Notification log: what was sent, when (docs/01). Channel may be "in-app".
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // due_today | new_email | brief | error
  title: text("title").notNull(),
  body: text("body"),
  channel: text("channel").notNull().default("in-app"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  // Idempotency key so a cron run does not double-notify (e.g. "due_today:2026-06-11").
  dedupeKey: text("dedupe_key"),
});

// Parsed task snapshot for fast UI reads. Vault stays truth; the sync cron
// rebuilds this from the live vault every few minutes and on webhook.
export const vaultTasks = pgTable(
  "vault_tasks",
  {
    id: text("id").primaryKey(), // hash of sourceFile + ":" + sourceLine
    sourceFile: text("source_file").notNull(),
    sourceLine: integer("source_line").notNull(),
    done: boolean("done").notNull().default(false),
    title: text("title").notNull(),
    description: text("description"),
    notes: text("notes"),
    workstream: text("workstream"),
    customer: text("customer"),
    due: text("due"),
    priority: text("priority"),
    createdField: text("created_field"),
    thread: text("thread"),
    fields: jsonb("fields").$type<Record<string, string>>(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dueIdx: index("vault_tasks_due_idx").on(t.due),
    doneIdx: index("vault_tasks_done_idx").on(t.done),
  }),
);

// Quote drafts in progress (Phase 3). Final PDF is generated on demand.
export const quoteDrafts = pgTable("quote_drafts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Untitled quote"),
  customer: text("customer"),
  workstream: text("workstream").notNull().default("merit"),
  lineItems: jsonb("line_items")
    .$type<
      Array<{ partNumber: string; description: string; qty: number; unitCost: number }>
    >()
    .notNull()
    .default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Document library (Milestone 3): reference material (ISO docs, biocomp,
// drawings, certs, PCNs, specs) lives in Vercel Blob; this table is the index
// the app and the brain search. extractedText holds PDF text for retrieval.
export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    blobUrl: text("blob_url").notNull(),
    // Tag taxonomy: iso | biocomp | drawing | cert | pcn | spec | other
    docType: text("doc_type").notNull().default("other"),
    account: text("account"), // optional account/customer name this belongs to
    tags: jsonb("tags").$type<string[]>().default([]),
    extractedText: text("extracted_text"), // PDF text for search (best-effort)
    notes: text("notes"),
    // For quotes: the full QuoteSpec so a saved quote can be re-opened and edited.
    spec: jsonb("spec"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    accountIdx: index("documents_account_idx").on(t.account),
    typeIdx: index("documents_doc_type_idx").on(t.docType),
  }),
);

// ---- Cutover tables: the app becomes the source of truth (docs/DB-CUTOVER.md).
// These RETAIN EVERYTHING (no 30-row index cap); the vault is seed-in/export-out.

export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    type: text("type"),
    region: text("region"),
    stage: text("stage"),
    status: text("status"),
    accountNumber: text("account_number"),
    workstream: text("workstream").notNull().default("merit"),
    overview: text("overview"),
    situations: jsonb("situations").$type<string[]>(),
    links: jsonb("links").$type<string[]>(),
    sourcePath: text("source_path"), // original vault path, for export
    // Provenance (Phase 2): seed | app | proposal. Re-seed touches only 'seed'.
    origin: text("origin").notNull().default("seed"),
    confirmedBy: text("confirmed_by"),
    supersededBy: integer("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ slugUx: uniqueIndex("accounts_slug_ux").on(t.slug) }),
);

// Unified identity: a "contact" is just a person with classification=customer
// and an accountId. Short names fold into one person via person_aliases.
export const people = pgTable(
  "people",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    classification: text("classification").notNull().default("unknown"), // internal | customer | unknown
    accountId: integer("account_id").references(() => accounts.id),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    isSelf: boolean("is_self").notNull().default(false), // Jordan
    needsReview: boolean("needs_review").notNull().default(false),
    sourcePaths: jsonb("source_paths").$type<string[]>().default([]),
    origin: text("origin").notNull().default("seed"), // seed | app | proposal
    confirmedBy: text("confirmed_by"),
    supersededBy: integer("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    classIdx: index("people_classification_idx").on(t.classification),
    reviewIdx: index("people_needs_review_idx").on(t.needsReview),
  }),
);

export const personAliases = pgTable(
  "person_aliases",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id").notNull().references(() => people.id),
    alias: text("alias").notNull(),
  },
  (t) => ({ aliasUx: uniqueIndex("person_aliases_alias_ux").on(t.alias) }),
);

export const series = pgTable("series", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cadence: text("cadence"),
  accountId: integer("account_id").references(() => accounts.id),
  status: text("status").notNull().default("active"),
  currentState: text("current_state"),
  bodyMarkdown: text("body_markdown"), // full doc content; parseSeriesDoc runs on it
  sourcePath: text("source_path"),
  origin: text("origin").notNull().default("seed"), // seed | app | proposal
  confirmedBy: text("confirmed_by"),
  supersededBy: integer("superseded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetings = pgTable(
  "meetings",
  {
    id: serial("id").primaryKey(),
    date: text("date"), // YYYY-MM-DD
    title: text("title").notNull(),
    accountId: integer("account_id").references(() => accounts.id), // null => internal
    isInternal: boolean("is_internal").notNull().default(false),
    topic: text("topic"),
    granolaId: text("granola_id"),
    bodyMarkdown: text("body_markdown"),
    sections: jsonb("sections").$type<Record<string, string>>(),
    seriesId: integer("series_id").references(() => series.id),
    sourcePath: text("source_path"), // original vault path, for export
    origin: text("origin").notNull().default("seed"), // seed | app | proposal
    confirmedBy: text("confirmed_by"),
    supersededBy: integer("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dateIdx: index("meetings_date_idx").on(t.date),
    accountIdx: index("meetings_account_idx").on(t.accountId),
    sourceUx: uniqueIndex("meetings_source_path_ux").on(t.sourcePath),
  }),
);

export const meetingAttendees = pgTable(
  "meeting_attendees",
  {
    meetingId: integer("meeting_id").notNull().references(() => meetings.id),
    personId: integer("person_id").notNull().references(() => people.id),
  },
  (t) => ({ pk: uniqueIndex("meeting_attendees_pk").on(t.meetingId, t.personId) }),
);

// Unifies Jordan's tasks and tracking-only action items.
export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    meetingId: integer("meeting_id").references(() => meetings.id),
    ownerPersonId: integer("owner_person_id").references(() => people.id),
    accountId: integer("account_id").references(() => accounts.id),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    due: text("due"),
    priority: text("priority"),
    status: text("status"),
    isJordans: boolean("is_jordans").notNull().default(false),
    description: text("description"),
    notes: text("notes"),
    // Vault task contract fields (Phase 2): carried directly so app-created
    // tasks need no source file, and seeded ones round-trip through export.
    workstream: text("workstream"),
    customer: text("customer"), // display name, or "internal"
    createdField: text("created_field"),
    scheduled: text("scheduled"),
    thread: text("thread"),
    completed: text("completed"),
    fields: jsonb("fields").$type<Record<string, string>>(),
    sourcePath: text("source_path"),
    sourceLine: integer("source_line"),
    // Stable, line-independent meeting-action identity (Slice B). Nullable:
    // legacy rows and non-meeting tasks carry NULL. Populated by Slice D when
    // the writer reconciles actions by id instead of source_line. Added via
    // drizzle/0010_meeting_action_identity.sql (migration-only, no runtime DDL).
    actionId: text("action_id"),
    origin: text("origin").notNull().default("seed"), // seed | app | proposal
    confirmedBy: text("confirmed_by"),
    supersededBy: integer("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    doneIdx: index("tasks_done_idx").on(t.done),
    ownerIdx: index("tasks_owner_idx").on(t.ownerPersonId),
    actionIdIdx: index("tasks_action_id_idx").on(t.actionId),
  }),
);

// Emails as a first-class entity (authoritative copy; seeded from email_queue
// and the live pipeline). bodyText is kept so the AI can use the thread as
// context when drafting a reply from a linked task.
export const emails = pgTable(
  "emails",
  {
    id: serial("id").primaryKey(),
    messageId: text("message_id"), // Outlook internet message id (reply/dedupe key)
    threadId: text("thread_id"), // conversation id when available
    direction: text("direction").notNull().default("inbound"), // inbound | outbound
    receivedAt: timestamp("received_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }), // when the message was sent
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    toAddrs: jsonb("to_addrs").$type<string[]>().default([]), // recipient emails
    cc: jsonb("cc").$type<string[]>().default([]),
    // Structured recipients [{ name, email, role: from|to|cc }] for the thread UI.
    recipients: jsonb("recipients")
      .$type<Array<{ name?: string; email: string; role: string }>>()
      .default([]),
    subject: text("subject"),
    bodyPreview: text("body_preview"),
    bodyText: text("body_text"), // for AI drafting context + brain retrieval
    bodyHtml: text("body_html"), // rendered chain view
    hasAttachments: boolean("has_attachments").notNull().default(false),
    webLink: text("web_link"),
    accountId: integer("account_id"), // resolved customer account (no FK: firehose is self-provisioning)
    personId: integer("person_id"), // resolved sender person
    needsReview: boolean("needs_review").notNull().default(false), // unmapped sender/account
    // dev-feedback #13: Jordan explicitly set this thread's account (manual
    // override, e.g. an all-internal thread with no unmapped sender to link).
    // Automatic remapping (domain link, sender backfill) must never clobber it.
    accountManual: boolean("account_manual").notNull().default(false),
    // Action state (unified inbox). flagged = you flagged it in Outlook (the
    // explicit "act on this now" signal); status tracks triage of the thread.
    flagged: boolean("flagged").notNull().default(false),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }),
    status: text("status").notNull().default("new"), // new | replied | archived
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    read: boolean("read").notNull().default(false), // opened in-app
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    messageIdIdx: index("emails_message_id_idx").on(t.messageId),
    threadIdx: index("emails_thread_idx").on(t.threadId),
    accountIdx: index("emails_account_idx").on(t.accountId),
    sentAtIdx: index("emails_sent_at_idx").on(t.sentAt),
  }),
);

// One row per (message, address) so we can query: all emails for a contact, for
// a customer account, and the full thread. Linked best-effort to people/accounts
// by email address (no FK: the firehose self-provisions and must not fail if the
// cutover tables are absent).
export const emailParticipants = pgTable(
  "email_participants",
  {
    id: serial("id").primaryKey(),
    emailId: integer("email_id").notNull(),
    personId: integer("person_id"),
    accountId: integer("account_id"),
    address: text("address"),
    name: text("name"),
    role: text("role").notNull().default("to"), // from | to | cc
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("email_participants_email_idx").on(t.emailId),
    personIdx: index("email_participants_person_idx").on(t.personId),
    accountIdx: index("email_participants_account_idx").on(t.accountId),
    addressIdx: index("email_participants_address_idx").on(t.address),
  }),
);

// Email attachments: bytes go to a PRIVATE Blob store (served via authed proxy),
// the row holds metadata + best-effort extracted text for the brain.
export const emailAttachments = pgTable(
  "email_attachments",
  {
    id: serial("id").primaryKey(),
    emailId: integer("email_id").notNull(),
    fileName: text("file_name"),
    contentType: text("content_type"),
    isImage: boolean("is_image").notNull().default(false),
    isInline: boolean("is_inline").notNull().default(false), // signature/embedded image
    blobUrl: text("blob_url"), // null when no Blob store configured
    sizeBytes: integer("size_bytes"),
    extractedText: text("extracted_text"), // PDF text for retrieval (best-effort)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("email_attachments_email_idx").on(t.emailId),
  }),
);

// Post-hoc AI triage of a thread (Haiku). Keyed by the same threadKey the read
// layer uses (t:<conversationId> or m:<emailId>). `signature` captures the
// thread's state (message count + latest id) so triage re-runs when it changes.
export const emailTriage = pgTable(
  "email_triage",
  {
    id: serial("id").primaryKey(),
    threadKey: text("thread_key").notNull(),
    summary: text("summary"),
    pathway: text("pathway"),
    priority: text("priority"),
    needsReply: boolean("needs_reply").notNull().default(false),
    signature: text("signature"),
    // True model that served the triage call (from the API response). Rows
    // written before the Phase 1 fix carry 'unknown (pre-fix)'.
    model: text("model"),
    // Provenance: true while the stored values are AI-authored and untouched.
    // First manual correction flips it and freezes the AI values in aiSnapshot.
    aiGenerated: boolean("ai_generated").notNull().default(true),
    aiSnapshot: jsonb("ai_snapshot").$type<{
      summary: string | null;
      pathway: string | null;
      priority: string | null;
      needsReply: boolean;
      model: string | null;
    }>(),
    // Manual triage: Jordan set the pathway/reviewed himself, so auto-triage must
    // not clobber it. reviewed removes the thread from Needs-attention.
    reviewed: boolean("reviewed").notNull().default(false),
    manual: boolean("manual").notNull().default(false),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ keyUx: uniqueIndex("email_triage_thread_key_ux").on(t.threadKey) }),
);

// Many-to-many task <-> email link: a task can reference several emails and an
// email can spawn/relate to several tasks. Drives "reply from a task with the
// thread as AI context" and "create task from email".
export const taskEmails = pgTable(
  "task_emails",
  {
    taskId: integer("task_id").notNull().references(() => tasks.id),
    emailId: integer("email_id").notNull().references(() => emails.id),
    // Provenance (dev-feedback #11, smart task<->email linkage). Every row
    // here is a CONFIRMED link (Jordan approved it, directly or via the
    // suggestion flow); nothing writes here unconfirmed. aiGenerated records
    // whether the link originated from the AI matcher (lib/taskEmailMatch.ts)
    // vs a direct manual action ("Create task from thread"), mirroring the
    // ai_generated pattern in email_triage. confirmedBy names who approved it
    // (single-user app: always "jordan" once set).
    aiGenerated: boolean("ai_generated").notNull().default(false),
    confirmedBy: text("confirmed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: uniqueIndex("task_emails_pk").on(t.taskId, t.emailId) }),
);

// Many-to-many task <-> meeting link (dev-feedback #14 Part 3): same shape
// and provenance discipline as task_emails above, but a DIFFERENT
// relationship than tasks.meetingId (the single meeting a task was born from
// at pull time, e.g. an action item extracted there). This table is "this
// task also relates to / is informed by this meeting", additive, confirmed
// only, never automatic.
export const taskMeetings = pgTable(
  "task_meetings",
  {
    taskId: integer("task_id").notNull().references(() => tasks.id),
    meetingId: integer("meeting_id").notNull().references(() => meetings.id),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    confirmedBy: text("confirmed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: uniqueIndex("task_meetings_pk").on(t.taskId, t.meetingId) }),
);

// Cached AI extraction of what an inbound email asks for / provides
// (dev-feedback #14 Part 2). One row per email, computed lazily and reused
// across page views and matching calls instead of re-run on every render
// (see lib/emailExtraction.ts's ensureEmailExtraction). The asks/provides
// text feeds a plain deterministic phrase-overlap check in
// lib/taskEmailMatch.ts as a QUALIFYING signal; extraction is the only AI
// step here, the crossing itself stays pure.
export const emailExtractions = pgTable(
  "email_extractions",
  {
    id: serial("id").primaryKey(),
    emailId: integer("email_id").notNull(),
    asks: jsonb("asks").$type<string[]>().notNull().default([]),
    provides: jsonb("provides").$type<string[]>().notNull().default([]),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ emailIdUx: uniqueIndex("email_extractions_email_id_ux").on(t.emailId) }),
);

// User-managed brand kits (Phase 3 PART B). The shared exports (PDF, email HTML)
// are CLIENT-branded; a meeting resolves its kit by workstream. One row per
// workstream (workstreamKey unique, nullable for ad-hoc kits). logoUrl points to
// Blob (or a data URL fallback).
export const brandKits = pgTable(
  "brand_kits",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    workstreamKey: text("workstream_key"), // "merit" | "sloan" | "personal" | null
    primary: text("primary").notNull(),
    secondary: text("secondary").notNull(),
    accent: text("accent").notNull(),
    paper: text("paper"), // document background ("paper"); null => white
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ wsUx: uniqueIndex("brand_kits_workstream_ux").on(t.workstreamKey) }),
);

// AI proposals (Phase 1): model output staged for Jordan's approval before any
// canonical write. Kinds: meeting-file, series-update (Granola pull). The
// payload carries everything execution needs; approval never re-runs the AI.
// Self-provisioned by lib/proposals/schema.ts.
export const aiProposals = pgTable(
  "ai_proposals",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // meeting-file | series-update
    dedupeKey: text("dedupe_key"), // granola:<id> | series:<path>:<basename>
    parentId: integer("parent_id"), // series-update -> its meeting-file proposal
    payload: jsonb("payload").notNull(),
    summary: text("summary"), // one-liner for the queue card
    // pending | approved | rejected | error | expired | superseded
    status: text("status").notNull().default("pending"),
    model: text("model"), // true model that produced the AI content
    error: text("error"), // execution failure / warnings
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("ai_proposals_status_idx").on(t.status),
    dedupeIdx: index("ai_proposals_dedupe_idx").on(t.kind, t.dedupeKey),
  }),
);

// Key-value for sync bookkeeping (last sync time, etc.).
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Per-agent knobs for the /agents oversight view (self-provisioned by
// lib/agents/settings.ts; drizzle/0009 is the hand-run record).
export const agentSettings = pgTable("agent_settings", {
  agent: text("agent").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  modelChoice: text("model_choice").notNull().default("default"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
