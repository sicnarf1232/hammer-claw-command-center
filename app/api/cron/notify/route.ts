import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { dbConfigured } from "@/lib/db";
import { vaultConfigured } from "@/lib/vault";
import { getTodayTasks } from "@/lib/today";
import { createNotification, deliverPending } from "@/lib/notify";
import { appTimezone, isLocalRunTime, localParts } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily "N tasks due today" notification (idempotent per day) plus delivery of
// any unsent notifications (including new-flagged-email ones logged on webhook)
// to the external channel if NOTIFY_WEBHOOK_URL is set.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json(
      { error: "Database not configured." },
      { status: 503 },
    );
  }

  // Runs hourly (Vercel cron is UTC-only); gate the daily digest on 7am local.
  // `?force=1` bypasses for manual triggers.
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force && !isLocalRunTime(7)) {
    const p = localParts();
    return NextResponse.json({
      ok: true,
      skipped: "Not the scheduled local time for the daily notification.",
      localTime: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
      timezone: appTimezone(),
    });
  }

  let dueCreated = false;
  if (vaultConfigured()) {
    try {
      const { today, tasks } = await getTodayTasks();
      if (tasks.length > 0) {
        const res = await createNotification({
          kind: "due_today",
          title: `${tasks.length} task${tasks.length === 1 ? "" : "s"} due today`,
          body: tasks
            .slice(0, 8)
            .map((t) => t.title)
            .join("; "),
          meta: { count: tasks.length, date: today },
          dedupeKey: `due_today:${today}`,
        });
        dueCreated = res.created;
      }
    } catch {
      // Vault read failed; still deliver any pending notifications.
    }
  }

  const { delivered } = await deliverPending();
  return NextResponse.json({ ok: true, dueCreated, delivered });
}
