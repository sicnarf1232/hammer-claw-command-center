// One-off operator check: diff the LIVE Neon schema against every DDL source in
// the repo (lib/schemaCheck.ts). Run from the repo root with Node >= 23.6
// (native type stripping):
//
//   node scripts/check-live-schema.mts
//
// Reads POSTGRES_URL from .env.local (pull with `vercel env pull .env.local`).
// Read-only: information_schema queries only. The deployed equivalent is
// GET /api/debug/schema.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { diffSchema, summarizeFks } from "../lib/schemaCheck.ts";

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

const cols = await sql`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, ordinal_position
`;
const live = cols.map((r) => ({
  table: String(r.table_name),
  column: String(r.column_name),
}));

const fkRows = await sql`
  select table_name, constraint_name
  from information_schema.table_constraints
  where table_schema = 'public' and constraint_type = 'FOREIGN KEY'
  order by table_name, constraint_name
`;
const fks = summarizeFks(
  fkRows.map((r) => ({
    table: String(r.table_name),
    constraint: String(r.constraint_name),
  })),
);

const diff = diffSchema(live);
const has = (t: string, c: string) =>
  live.some((x) => x.table === t && x.column === c);

console.log(
  JSON.stringify(
    {
      documentsSpecExists: has("documents", "spec"),
      brandKitsPaperExists: has("brand_kits", "paper"),
      tableCount: new Set(live.map((c) => c.table)).size,
      foreignKeys: fks,
      diff,
    },
    null,
    2,
  ),
);
