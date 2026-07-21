import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { confirmTaskMeetingLinks } from "@/lib/taskMeetingLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Confirm a task<->meeting link (dev-feedback #14 Part 3). Mirrors
// /api/tasks/link-email exactly: only ever called after Jordan acts, from
// the tasks page. Never automatic: this is the one write path into
// task_meetings for suggested matches, and every row it writes is stamped
// confirmed_by.
// body: { sourceFile, sourceLine, meetingIds: number[], aiGenerated? }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const sourceFile = typeof body?.sourceFile === "string" ? body.sourceFile : "";
  const sourceLine = Number(body?.sourceLine);
  const meetingIds = Array.isArray(body?.meetingIds)
    ? body.meetingIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n))
    : [];
  if (!sourceFile || !Number.isInteger(sourceLine) || sourceLine < 0) {
    return NextResponse.json(
      { error: "sourceFile and sourceLine are required." },
      { status: 400 },
    );
  }
  if (!meetingIds.length) {
    return NextResponse.json({ error: "At least one meetingId is required." }, { status: 400 });
  }

  try {
    const result = await confirmTaskMeetingLinks({
      sourceFile,
      sourceLine,
      meetingIds,
      aiGenerated: body?.aiGenerated === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Link failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
