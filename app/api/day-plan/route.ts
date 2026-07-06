import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side persistence for the Build Your Day planner, so a day's time-blocks
// survive across devices. Keyed by date under settings ("day-plan:<YYYY-MM-DD>").
// A block is { start, duration, done } keyed by vault task id.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  if (!dbConfigured()) return NextResponse.json({ date, plan: {} });
  const plan = (await getSetting<Record<string, unknown>>(`day-plan:${date}`)) ?? {};
  return NextResponse.json({ date, plan });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date : "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  if (typeof body?.plan !== "object" || body.plan == null) {
    return NextResponse.json({ error: "plan (object) is required." }, { status: 400 });
  }
  if (!dbConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  await setSetting(`day-plan:${date}`, body.plan);
  return NextResponse.json({ ok: true });
}
