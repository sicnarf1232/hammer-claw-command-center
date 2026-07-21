import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { addTaskUpdateForTask } from "@/lib/taskUpdates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEN = 4000;

// Manual "Add update" affordance in the task detail view (dev-feedback #16
// Part A): Jordan types a free-text update ("talked to Scott, waiting on his
// confirmation") and it appends to the task's update log with kind "manual".
// body: { sourceFile, sourceLine, text }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const sourceFile = typeof body?.sourceFile === "string" ? body.sourceFile : "";
  const sourceLine = Number(body?.sourceLine);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!sourceFile || !Number.isInteger(sourceLine) || sourceLine < 0) {
    return NextResponse.json(
      { error: "sourceFile and sourceLine are required." },
      { status: 400 },
    );
  }
  if (!text) {
    return NextResponse.json({ error: "Update text is required." }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: `Update is too long (max ${MAX_LEN} characters).` }, { status: 400 });
  }

  try {
    await addTaskUpdateForTask(sourceFile, sourceLine, "manual", text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add the update.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
