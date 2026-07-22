// Operator command: apply a checked-in Drizzle SQL migration to the database in
// POSTGRES_URL. This repo has no Drizzle migration journal and does not apply
// drizzle/*.sql automatically, so this is the exact, repeatable way to run one.
//
//   node scripts/apply-migration.mts drizzle/0010_meeting_action_identity.sql
//   node scripts/apply-migration.mts drizzle/0010_meeting_action_identity.sql --dry-run
//
// Reads POSTGRES_URL from the environment, else from .env.local (pull with
// `vercel env pull .env.local`). Point POSTGRES_URL at an ISOLATED PREVIEW Neon
// branch first; never run it straight at production. Migrations here are written
// idempotent (IF NOT EXISTS), so a repeat run is a safe no-op.
//
// --dry-run prints the statements it would execute and touches no database.

import { readFileSync } from "node:fs";
import { neonConfig, Client } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

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

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!file || file.startsWith("--")) {
  console.error(
    "usage: node scripts/apply-migration.mts <path-to.sql> [--dry-run]",
  );
  process.exit(1);
}

// Simple splitter for the repo's plain DDL files: drop `--` comment lines, then
// split on statement-terminating semicolons. The migrations here contain no
// semicolons inside string/identifier literals, so this is sufficient.
const raw = readFileSync(file, "utf8");
const statements = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

if (!statements.length) {
  console.error(`No executable statements found in ${file}`);
  process.exit(1);
}

if (dryRun) {
  console.log(`[dry-run] ${statements.length} statement(s) from ${file}:\n`);
  statements.forEach((s, i) => console.log(`-- [${i + 1}]\n${s};\n`));
  process.exit(0);
}

const url = process.env.POSTGRES_URL ?? envLocal("POSTGRES_URL");
if (!url) {
  console.error("POSTGRES_URL not found in env or .env.local");
  process.exit(1);
}

const client = new Client(url);
await client.connect();
try {
  for (const stmt of statements) {
    const head = stmt.split("\n")[0].slice(0, 90);
    process.stdout.write(`applying: ${head} ... `);
    await client.query(stmt);
    console.log("ok");
  }
} finally {
  await client.end();
}
console.log(`Applied ${statements.length} statement(s) from ${file}`);
