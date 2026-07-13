import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { dbDeleteSeries } from "@/lib/meetingsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Delete a rolling series: removes the doc row and unlinks its meetings.
// The meeting notes themselves are untouched.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path.trim() : "";
  if (!path) {
    return NextResponse.json({ error: "A series path is required." }, { status: 400 });
  }
  try {
    const res = await dbDeleteSeries(path);
    if (!res.deleted) {
      return NextResponse.json({ error: "Series not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, unlinked: res.unlinked });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed." },
      { status: 500 },
    );
  }
}
