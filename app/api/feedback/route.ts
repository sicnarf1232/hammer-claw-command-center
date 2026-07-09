import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { addDevFeedback, listDevFeedback, setDevFeedbackStatus } from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The dev feedback bucket: quick app improvement notes Jordan drops from
// anywhere (the brain's /devfeedback command), drained during build sessions.
export async function GET(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const items = await listDevFeedback(status || undefined);
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Feedback text is required." }, { status: 400 });
  }
  const page = typeof body?.page === "string" ? body.page.slice(0, 200) : null;
  const id = await addDevFeedback(text.slice(0, 4000), page);
  return NextResponse.json({ ok: true, id });
}

// Mark an item done (or reopen it).
export async function PATCH(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const status = body?.status === "done" ? "done" : "open";
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  await setDevFeedbackStatus(id, status);
  return NextResponse.json({ ok: true });
}
