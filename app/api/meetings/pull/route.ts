import { NextResponse, type NextRequest } from "next/server";
import { granolaConfigured, GranolaNotConfiguredError } from "@/lib/granola";
import { aiConfigured } from "@/lib/ai";
import { vaultConfigured } from "@/lib/vault";
import { dbConfigured } from "@/lib/db";
import { stageGranolaMeetings } from "@/lib/meetingsPull";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Triage runs one AI call per meeting; give the pull room on a busy day.
export const maxDuration = 300;

// Stage recent Granola meetings as proposals for review (Path A: app button).
// Nothing is written to the vault here; approving on /meetings executes the
// writes. Behind the app password gate (middleware), so only Jordan triggers it.
export async function POST(_req: NextRequest) {
  if (!granolaConfigured()) {
    return NextResponse.json(
      { error: "Granola not configured (GRANOLA_API_KEY unset)." },
      { status: 503 },
    );
  }
  if (!vaultConfigured()) {
    return NextResponse.json(
      { error: "Vault not configured (GITHUB_TOKEN / VAULT_REPO)." },
      { status: 503 },
    );
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI triage unavailable (ANTHROPIC_API_KEY unset)." },
      { status: 503 },
    );
  }
  if (!dbConfigured()) {
    return NextResponse.json(
      { error: "Database not configured (POSTGRES_URL). Proposals need the DB." },
      { status: 503 },
    );
  }

  try {
    const result = await stageGranolaMeetings();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof GranolaNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Granola pull failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
