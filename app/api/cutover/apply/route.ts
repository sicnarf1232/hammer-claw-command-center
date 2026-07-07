import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { dbConfigured } from "@/lib/db";
import { applySeed } from "@/lib/cutover/apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diff/upsert apply (Phase 2): seed the app DB from the vault. Only
// origin='seed' rows are updated or removed; app-created rows always survive.
// Returns the per-table diff so the run is inspectable. Requires an explicit
// confirm. body: { confirm: true }
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  if (!dbConfigured()) {
    return NextResponse.json(
      { error: "POSTGRES_URL not set. Provision Vercel Postgres and run `npm run db:push` first." },
      { status: 503 },
    );
  }
  const body = await req.json().catch(() => null);
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: "Pass { confirm: true } to sync the cutover tables from the vault." },
      { status: 400 },
    );
  }
  try {
    const result = await applySeed();
    return NextResponse.json({
      ok: true,
      counts: result.report.counts,
      plan: result.plan,
      needsReview: result.report.needsReview.slice(0, 200),
      merges: result.report.merges.slice(0, 100),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apply failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
