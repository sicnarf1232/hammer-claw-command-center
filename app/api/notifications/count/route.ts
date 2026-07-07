import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unseen-notification count for the nav bell. "Seen" is client-side (the bell
// stamps localStorage when opened), so the query is just created_at > since.
export async function GET(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ ok: true, count: 0 });
  const since = req.nextUrl.searchParams.get("since");
  const sinceDate = since && !Number.isNaN(Date.parse(since))
    ? new Date(since)
    : new Date(Date.now() - 48 * 3600 * 1000); // default: last 48h
  try {
    const res = await getDb().execute(
      sql`select count(*)::int as n from notifications where created_at > ${sinceDate.toISOString()}`,
    );
    const rows = Array.isArray(res)
      ? (res as Array<{ n: number }>)
      : (((res as { rows?: unknown }).rows ?? []) as Array<{ n: number }>);
    return NextResponse.json({ ok: true, count: rows[0]?.n ?? 0 });
  } catch {
    return NextResponse.json({ ok: true, count: 0 });
  }
}
