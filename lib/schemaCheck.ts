// Expected live-database shape, assembled from every DDL source in the repo,
// plus pure helpers to diff it against what information_schema actually reports.
// Pure module (no imports) so the diff logic is unit-testable and the expected
// shape can be read by scripts outside Next.
//
// Sources of truth per table group:
//   - lib/cutover/schema.ts      (accounts, people, person_aliases, series,
//                                 meetings, meeting_attendees, tasks)
//   - lib/firehose/schema.ts     (emails, email_participants, email_attachments,
//                                 email_triage)
//   - lib/settings.ts            (app_settings)
//   - lib/taskMeta.ts            (task_meta)
//   - lib/db/schema.ts + drizzle/*.sql for the rest (webhook_events, email_queue,
//     notifications, vault_tasks, quote_drafts, documents, brand_kits, app_meta,
//     task_emails). documents.spec and brand_kits.paper are declared in
//     lib/db/schema.ts but have no committed migration; whether they exist live
//     is exactly what this check settles (PUNCHLIST).

export const EXPECTED_SCHEMA: Record<string, string[]> = {
  // drizzle/0000 + lib/db/schema.ts
  webhook_events: [
    "id", "message_id", "signature_valid", "kind", "payload", "received_at",
  ],
  email_queue: [
    "id", "message_id", "received_at", "from_name", "from_email", "to_addrs",
    "cc", "subject", "body_preview", "body_html", "body_text",
    "has_attachments", "web_link", "status", "workstream", "account",
    "filed_path", "filed_commit", "replied_at", "created_at", "updated_at",
  ],
  notifications: [
    "id", "kind", "title", "body", "channel", "meta", "created_at", "sent_at",
    "dedupe_key",
  ],
  vault_tasks: [
    "id", "source_file", "source_line", "done", "title", "description",
    "notes", "workstream", "customer", "due", "priority", "created_field",
    "thread", "fields", "synced_at",
  ],
  quote_drafts: [
    "id", "title", "customer", "workstream", "line_items", "notes",
    "created_at", "updated_at",
  ],
  // drizzle/0001; `spec` only in lib/db/schema.ts (no migration anywhere)
  documents: [
    "id", "title", "file_name", "content_type", "size_bytes", "blob_url",
    "doc_type", "account", "tags", "extracted_text", "notes", "spec",
    "uploaded_at",
  ],
  // drizzle/0004; `paper` only via hand-run brand-kits.sql / cutover-setup.sql
  brand_kits: [
    "id", "name", "workstream_key", "primary", "secondary", "accent", "paper",
    "logo_url", "created_at", "updated_at",
  ],
  app_meta: ["key", "value", "updated_at"],

  // lib/cutover/schema.ts (origin/confirmed_by/superseded_by = Phase 2 provenance)
  accounts: [
    "id", "name", "slug", "type", "region", "stage", "status",
    "account_number", "workstream", "overview", "situations", "links",
    "source_path", "origin", "confirmed_by", "superseded_by", "created_at",
    "updated_at",
  ],
  people: [
    "id", "full_name", "classification", "account_id", "title", "email",
    "phone", "is_self", "needs_review", "source_paths", "origin",
    "confirmed_by", "superseded_by", "created_at", "updated_at",
  ],
  person_aliases: ["id", "person_id", "alias"],
  series: [
    "id", "name", "cadence", "account_id", "status", "current_state",
    "body_markdown", "source_path", "origin", "confirmed_by", "superseded_by",
    "created_at", "updated_at",
  ],
  meetings: [
    "id", "date", "title", "account_id", "is_internal", "topic", "granola_id",
    "body_markdown", "sections", "series_id", "source_path", "origin",
    "confirmed_by", "superseded_by", "created_at", "updated_at",
  ],
  meeting_attendees: ["meeting_id", "person_id"],
  tasks: [
    "id", "meeting_id", "owner_person_id", "account_id", "text", "done",
    "due", "priority", "status", "is_jordans", "description", "notes",
    "workstream", "customer", "created_field", "scheduled", "thread",
    "completed", "fields", "source_path", "source_line",
    // Slice B: stable meeting-action identity (drizzle/0010). Expected live once
    // the migration is applied; verify with scripts/verify-migration-0010.mts.
    "action_id",
    "origin", "confirmed_by", "superseded_by", "created_at", "updated_at",
  ],

  // lib/firehose/schema.ts
  emails: [
    "id", "message_id", "thread_id", "direction", "received_at", "sent_at",
    "from_name", "from_email", "to_addrs", "cc", "recipients", "subject",
    "body_preview", "body_text", "body_html", "has_attachments", "web_link",
    "account_id", "person_id", "needs_review", "flagged", "flagged_at",
    "status", "replied_at", "read", "read_at", "created_at",
  ],
  email_participants: [
    "id", "email_id", "person_id", "account_id", "address", "name", "role",
    "created_at",
  ],
  email_attachments: [
    "id", "email_id", "file_name", "content_type", "is_image", "is_inline",
    "blob_url", "size_bytes", "extracted_text", "created_at",
  ],
  email_triage: [
    "id", "thread_key", "summary", "pathway", "priority", "needs_reply",
    "signature", "model", "ai_generated", "ai_snapshot", "reviewed", "manual",
    "reviewed_at", "updated_at",
  ],
  // lib/firehose/domains.ts
  account_domains: ["domain", "account_id", "created_at"],
  // lib/proposals/schema.ts (Phase 1)
  ai_proposals: [
    "id", "kind", "dedupe_key", "parent_id", "payload", "summary", "status",
    "model", "error", "created_at", "decided_at", "executed_at",
  ],

  // drizzle/0003
  task_emails: ["task_id", "email_id", "created_at"],
  // lib/taskMeta.ts
  task_meta: [
    "task_id", "checklist", "linked_thread_key", "last_customer_update",
    "notes", "updated_at",
  ],
  // lib/settings.ts
  app_settings: ["key", "value", "updated_at"],
};

export interface LiveColumn {
  table: string;
  column: string;
}

export interface SchemaDiff {
  /** Expected tables with no live columns at all. */
  missingTables: string[];
  /** Live tables we have no DDL for (drizzle bookkeeping, experiments, ...). */
  extraTables: string[];
  /** Columns the DDL expects but the live table lacks. */
  missingColumns: Array<{ table: string; column: string }>;
  /** Live columns no DDL source declares. */
  extraColumns: Array<{ table: string; column: string }>;
}

export function diffSchema(
  live: LiveColumn[],
  expected: Record<string, string[]> = EXPECTED_SCHEMA,
): SchemaDiff {
  const liveByTable = new Map<string, Set<string>>();
  for (const { table, column } of live) {
    let set = liveByTable.get(table);
    if (!set) liveByTable.set(table, (set = new Set()));
    set.add(column);
  }

  const missingTables: string[] = [];
  const missingColumns: SchemaDiff["missingColumns"] = [];
  const extraColumns: SchemaDiff["extraColumns"] = [];

  for (const [table, columns] of Object.entries(expected)) {
    const liveCols = liveByTable.get(table);
    if (!liveCols) {
      missingTables.push(table);
      continue;
    }
    for (const column of columns) {
      if (!liveCols.has(column)) missingColumns.push({ table, column });
    }
    const expectedSet = new Set(columns);
    for (const column of liveCols) {
      if (!expectedSet.has(column)) extraColumns.push({ table, column });
    }
  }

  const extraTables = [...liveByTable.keys()]
    .filter((t) => !(t in expected))
    .sort();

  return { missingTables, extraTables, missingColumns, extraColumns };
}

export interface FkRow {
  table: string;
  constraint: string;
}

/**
 * Group live FOREIGN KEY constraints by table. The drizzle migrations declare
 * FKs but the runtime self-provisioners deliberately do not, so which tables
 * actually carry constraints depends on provisioning history; the cutover's
 * delete/insert ordering must respect whatever this reports.
 */
export function summarizeFks(rows: FkRow[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { table, constraint } of rows) {
    (out[table] ??= []).push(constraint);
  }
  for (const list of Object.values(out)) list.sort();
  return out;
}
