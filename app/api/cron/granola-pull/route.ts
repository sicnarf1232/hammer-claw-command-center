import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { createNotification } from "@/lib/notify";
import { granolaConfigured } from "@/lib/granola";
import { aiConfigured } from "@/lib/ai";
import { pullGranolaMeetings } from "@/lib/meetingsPull";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Granola pull (Phase 4): pull recent meeting notes from Granola straight into
// the vault. Shares one implementation with the /meetings "Pull from Granola"
// button (lib/meetingsPull). Without GRANOLA_API_KEY the job is a clean no-op.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!granolaConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: "Granola not configured (GRANOLA_API_KEY unset).",
    });
  }
  if (!aiConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: "AI triage unavailable (ANTHROPIC_API_KEY unset).",
    });
  }

  try {
    const result = await pullGranolaMeetings();
    if (result.filed.length) {
      await createNotification({
        kind: "info",
        title: `Granola pull filed ${result.filed.length} meeting(s)`,
        body: result.filed.map((f) => `${f.title} (${f.bucket})`).join("; "),
        dedupeKey: `granola_pull_${new Date().toISOString().slice(0, 13)}`,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Granola pull failed.";
    await createNotification({
      kind: "error",
      title: "Granola pull failed",
      body: message,
      dedupeKey: "granola_pull_error",
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
