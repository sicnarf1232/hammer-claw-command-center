import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { dbConfigured } from "@/lib/db";
import { applySeed } from "@/lib/cutover/apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stage 1 apply: seed the app DB from the vault. Destructive to the cutover
// tables only (idempotent reload), so it requires an explicit confirm.
// body: { confirm: true }
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
      { error: "Pass { confirm: true } to reload the cutover tables." },
      { status: 400 },
    );
  }
  try {
    const report = await applySeed();
    return NextResponse.json({ ok: true, counts: report.counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apply failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
