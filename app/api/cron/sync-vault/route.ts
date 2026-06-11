import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { dbConfigured } from "@/lib/db";
import { isVaultConfigured } from "@/lib/github";
import { syncTasksSnapshot } from "@/lib/tasksSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Parse the live vault into Postgres so the UI reads fast. Vault stays truth.
// Scheduled by Vercel Cron (see vercel.json); also runnable manually with
// ?secret=<CRON_SECRET>.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured() || !isVaultConfigured()) {
    return NextResponse.json(
      { error: "Database or vault access not configured." },
      { status: 503 },
    );
  }
  const count = await syncTasksSnapshot();
  return NextResponse.json({ ok: true, tasksSynced: count });
}
