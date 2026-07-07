import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { dbConfigured } from "@/lib/db";
import { runExport, type ExportScope } from "@/lib/export/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One commit per changed file; a full first export can be a long batch.
export const maxDuration = 300;

const SCOPES: ExportScope[] = ["all", "accounts", "meetings", "series", "tasks", "index"];

// The deliberate vault export (DB-CUTOVER stage 5): the only path that writes
// the vault after the readonly flip. body: { scope: "all" | ... , confirm: true }
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: "Pass { confirm: true } to export the DB to the vault." },
      { status: 400 },
    );
  }
  const scope = (SCOPES as string[]).includes(body?.scope)
    ? (body.scope as ExportScope)
    : "all";
  try {
    const result = await runExport(scope);
    return NextResponse.json({ ok: true, scope, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
