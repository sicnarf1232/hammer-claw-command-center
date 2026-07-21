import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { listTaskUpdates } from "@/lib/taskUpdates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasks-page read for dev-feedback #16 Part A: the task's update log
// (manual notes, plus automatic email-linked / meeting-linked / status-change
// entries), newest first. GET ?sourceFile=&sourceLine=
export async function GET(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const sourceFile = req.nextUrl.searchParams.get("sourceFile")?.trim() ?? "";
  const sourceLine = Number(req.nextUrl.searchParams.get("sourceLine"));
  if (!sourceFile || !Number.isInteger(sourceLine) || sourceLine < 0) {
    return NextResponse.json(
      { error: "sourceFile and sourceLine query params are required." },
      { status: 400 },
    );
  }

  try {
    const updates = await listTaskUpdates(sourceFile, sourceLine);
    return NextResponse.json({ ok: true, updates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
