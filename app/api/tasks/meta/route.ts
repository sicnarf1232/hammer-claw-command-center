import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { setChecklist, setLinkedThread, markCustomerUpdated, type ChecklistStep } from "@/lib/taskMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Write app-side task augmentation (checklist / linked thread / customer-update
// timestamp) keyed by the vault task id. The vault markdown stays the truth.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  if (!taskId) return NextResponse.json({ error: "taskId is required." }, { status: 400 });

  try {
    if (Array.isArray(body.checklist)) {
      await setChecklist(taskId, body.checklist as ChecklistStep[]);
    }
    if (body.linkedThreadKey !== undefined) {
      await setLinkedThread(taskId, body.linkedThreadKey ? String(body.linkedThreadKey) : null);
    }
    if (body.markCustomerUpdated === true) {
      await markCustomerUpdated(taskId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[tasks/meta] failed:", err);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
