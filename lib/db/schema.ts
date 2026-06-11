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

// Key-value for sync bookkeeping (last sync time, etc.).
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
