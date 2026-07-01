import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { setManualTriage } from "@/lib/firehose/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATHWAYS = ["needs-reply", "quote-request", "quality-pcn", "logistics", "fyi", "noise"];

// Manual triage: Jordan sets the pathway / reviewed / needs-reply on a thread.
// This latches (manual=true) so AI auto-triage won't overwrite it.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const key: unknown = body?.key;
  if (typeof key !== "string" || !key) {
    return NextResponse.json({ error: "key is required." }, { status: 400 });
  }
  if (body.pathway !== undefined && !PATHWAYS.includes(body.pathway)) {
    return NextResponse.json({ error: "Unknown pathway." }, { status: 400 });
  }

  try {
    await setManualTriage(key, {
      pathway: typeof body.pathway === "string" ? body.pathway : undefined,
      needsReply: typeof body.needsReply === "boolean" ? body.needsReply : undefined,
      reviewed: typeof body.reviewed === "boolean" ? body.reviewed : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[inbox/triage-set] failed:", err);
    return NextResponse.json({ error: "Triage update failed." }, { status: 500 });
  }
}
