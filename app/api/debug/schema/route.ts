import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { diffSchema, summarizeFks, type LiveColumn, type FkRow } from "@/lib/schemaCheck";
import { cronConfigured } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only: diff the live Neon schema against every DDL source in the repo.
// Settles the PUNCHLIST unknowns (documents.spec, brand_kits.paper) and reports
// which env-dependent features are actually on in this deployment. Behind the
// app password like all /api/debug routes.

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  try {
    const db = getDb();
    const colRes = await db.execute(sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `);
    const live: LiveColumn[] = rowsOf(colRes).map((r) => ({
      table: String(r.table_name),
      column: String(r.column_name),
    }));

    const fkRes = await db.execute(sql`
      select table_name, constraint_name
      from information_schema.table_constraints
      where table_schema = 'public' and constraint_type = 'FOREIGN KEY'
      order by table_name, constraint_name
    `);
    const fks = summarizeFks(
      rowsOf(fkRes).map((r): FkRow => ({
        table: String(r.table_name),
        constraint: String(r.constraint_name),
      })),
    );

    const diff = diffSchema(live);
    const has = (table: string, column: string) =>
      live.some((c) => c.table === table && c.column === column);

    return NextResponse.json({
      ok: true,
      // The two historically unverified manual ALTERs (PUNCHLIST):
      documentsSpecExists: has("documents", "spec"),
      brandKitsPaperExists: has("brand_kits", "paper"),
      env: {
        cronSecretSet: cronConfigured(),
        notifyWebhookSet: Boolean(process.env.NOTIFY_WEBHOOK_URL),
        vaultMode: process.env.VAULT_MODE ?? null,
        anthropicModelOverride: process.env.ANTHROPIC_MODEL ?? null,
        anthropicFastModelOverride: process.env.ANTHROPIC_FAST_MODEL ?? null,
      },
      foreignKeys: fks,
      diff,
      tableCount: new Set(live.map((c) => c.table)).size,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
