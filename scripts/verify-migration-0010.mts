// Read-only verification that drizzle/0010_meeting_action_identity.sql is applied
// to the database in POSTGRES_URL. Run AFTER applying the migration (preview
// branch first, then production), before deploying the code that selects the
// new column:
//
//   node scripts/verify-migration-0010.mts
//
// Reads POSTGRES_URL from the environment, else from .env.local. Only issues
// information_schema / pg_indexes reads; it never writes. Exits non-zero if any
// check fails.
//
// Checks:
//   1. tasks.action_id column exists
//   2. index tasks_action_id_ux exists
//   3. it is UNIQUE
//   4. it is PARTIAL on `action_id IS NOT NULL`

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function envLocal(key: string): string | null {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && m[1] === key && m[2]) return m[2];
    }
  } catch {
    // fall through
  }
  return null;
}

const url = process.env.POSTGRES_URL ?? envLocal("POSTGRES_URL");
if (!url) {
  console.error("POSTGRES_URL not found in env or .env.local");
  process.exit(1);
}

const sql = neon(url);

const colRows = (await sql`
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'tasks'
    and column_name = 'action_id'
`) as unknown[];

const idxRows = (await sql`
  select indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'tasks'
    and indexname = 'tasks_action_id_ux'
`) as Array<{ indexdef: string }>;

const indexdef = idxRows[0]?.indexdef ?? "";
// pg normalizes the predicate to: ... WHERE (action_id IS NOT NULL)
const partialRe = /where\s*\(\s*action_id\s+is\s+not\s+null\s*\)/i;

const checks: Array<{ name: string; ok: boolean; detail?: string }> = [
  { name: "tasks.action_id column exists", ok: colRows.length === 1 },
  { name: "index tasks_action_id_ux exists", ok: idxRows.length === 1 },
  { name: "index is UNIQUE", ok: /unique\s+index/i.test(indexdef), detail: indexdef },
  {
    name: "index is PARTIAL on action_id IS NOT NULL",
    ok: partialRe.test(indexdef),
    detail: indexdef,
  },
];

let failed = false;
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}`);
  if (!c.ok) {
    failed = true;
    if (c.detail !== undefined) console.log(`      indexdef: ${c.detail || "(none)"}`);
  }
}

if (failed) {
  console.error("\nMigration 0010 verification FAILED.");
  process.exit(1);
}
console.log("\nMigration 0010 verified: action_id column + unique partial index present.");
