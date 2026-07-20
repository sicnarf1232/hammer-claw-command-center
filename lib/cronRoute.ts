import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { isVaultConfigured } from "@/lib/github";
import { writeBrief, type BriefKind } from "@/lib/briefs";
import { appTimezone, isLocalRunTime, localParts } from "@/lib/dates";

// When each brief fires in the app's local timezone. Vercel cron schedules are
// UTC-only with no timezone field, so the crons run hourly and the gate lives
// here. Change APP_TIMEZONE and every job moves with it, DST included.
type RunAt = { hour: number; weekday?: number };

// Shared handler for the three brief cron routes.
export function briefRoute(kind: BriefKind, runAt?: RunAt) {
  return async function GET(req: NextRequest) {
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // `?force=1` runs regardless of the clock, for manual triggers and testing.
    // Still requires the cron secret.
    const force = req.nextUrl.searchParams.get("force") === "1";
    if (runAt && !force && !isLocalRunTime(runAt.hour, runAt)) {
      const p = localParts();
      return NextResponse.json({
        ok: true,
        skipped: `Not the scheduled local time for the ${kind} brief.`,
        localTime: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
        timezone: appTimezone(),
      });
    }

    if (!isVaultConfigured()) {
      return NextResponse.json(
        { error: "Vault access not configured." },
        { status: 503 },
      );
    }
    try {
      const res = await writeBrief(kind);
      return NextResponse.json({ ok: true, ...res });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Brief failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
