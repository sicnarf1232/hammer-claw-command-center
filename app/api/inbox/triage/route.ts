import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { ensureTriageForKeys } from "@/lib/firehose/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Post-hoc AI triage for a batch of thread keys (called progressively by the
// inbox client). Bounded per call so it stays under the time cap.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  if (!aiConfigured()) {
    return NextResponse.json({ triaged: {}, triagedCount: 0, ai: false });
  }
  const body = await req.json().catch(() => null);
  const keys: unknown = body?.keys;
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string")) {
    return NextResponse.json({ error: "keys (string[]) is required." }, { status: 400 });
  }

  try {
    const map = await ensureTriageForKeys(keys as string[], 6);
    return NextResponse.json({
      triaged: Object.fromEntries(map),
      triagedCount: map.size,
      ai: true,
    });
  } catch (err) {
    console.error("[inbox/triage] failed:", err);
    return NextResponse.json({ error: "Triage failed." }, { status: 500 });
  }
}
