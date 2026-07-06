import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { safeEqual } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Calendar push (Milestone: Build Your Day). A Power Automate flow ("HC Calendar
// Push") queries Microsoft Graph /me/calendarView for the day and POSTs the
// events here; the app never calls Graph directly (CLAUDE.md). We cache them
// under settings key "calendar:<date>" for GET /api/calendar/today to serve.
// Verify the same shared secret as the email firehose.

interface IncomingEvent {
  id?: string;
  title?: string;
  subject?: string;
  startISO?: string;
  start?: string;
  endISO?: string;
  end?: string;
  location?: string | null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.HC_WEBHOOK_SECRET;
  const sig = req.headers.get("x-hc-signature") ?? "";
  if (!secret) return NextResponse.json({ error: "Webhook not configured (HC_WEBHOOK_SECRET unset)." }, { status: 503 });
  if (!sig || sig.length !== secret.length || !safeEqual(sig, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const body = await req.json().catch(() => null);
  const rawEvents: IncomingEvent[] = Array.isArray(body?.events) ? body.events : Array.isArray(body) ? body : [];
  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayISO();

  const events = rawEvents
    .map((e, i) => ({
      id: String(e.id ?? `evt-${i}`),
      title: String(e.title ?? e.subject ?? "Event"),
      startISO: String(e.startISO ?? e.start ?? ""),
      endISO: String(e.endISO ?? e.end ?? ""),
      location: e.location ?? null,
    }))
    .filter((e) => e.startISO && e.endISO);

  await setSetting(`calendar:${date}`, events);
  return NextResponse.json({ ok: true, date, count: events.length });
}
