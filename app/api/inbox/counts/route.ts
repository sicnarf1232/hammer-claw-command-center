import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { threadCounts } from "@/lib/firehose/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight inbox counts for the nav badge. Never errors to the client:
// an unconfigured DB or a read failure just reads as zero attention.
export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ ok: true, attention: 0 });
  }
  try {
    const counts = await threadCounts();
    return NextResponse.json({ ok: true, attention: counts.attention });
  } catch {
    return NextResponse.json({ ok: true, attention: 0 });
  }
}
