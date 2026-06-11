import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { setStatus } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dismiss an email from the queue without filing (status -> archived).
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json(
      { error: "Database not configured." },
      { status: 503 },
    );
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  await setStatus(body.id, "archived");
  return NextResponse.json({ ok: true });
}
