import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CalendarEvent {
  id: string;
  title: string;
  startISO: string;
  endISO: string;
  location?: string | null;
}

// Today's calendar events for the Build Your Day timeline. The app never calls
// Microsoft Graph directly (see CLAUDE.md); a Power Automate flow POSTs the
// day's events to /api/webhooks/calendar, which caches them under
// "calendar:<date>". Until that flow is live this returns an empty list so the
// planner degrades gracefully.
export async function GET() {
  const today = todayISO();
  if (!dbConfigured()) return NextResponse.json({ date: today, events: [], source: "none" });
  try {
    const events = (await getSetting<CalendarEvent[]>(`calendar:${today}`)) ?? [];
    return NextResponse.json({ date: today, events, source: events.length ? "flow" : "none" });
  } catch {
    return NextResponse.json({ date: today, events: [], source: "none" });
  }
}
