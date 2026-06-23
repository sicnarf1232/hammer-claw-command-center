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
    sourcePath: text("source_path"), // original vault path, for export
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
  sourcePath: text("source_path"),
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
    sourcePath: text("source_path"),
    sourceLine: integer("source_line"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    doneIdx: index("tasks_done_idx").on(t.done),
    ownerIdx: index("tasks_owner_idx").on(t.ownerPersonId),
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
