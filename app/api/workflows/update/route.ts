import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import {
  updateWorkflow,
  confirmWorkflow,
  archiveWorkflow,
  deleteWorkflow,
} from "@/lib/workflows";
import { sanitizeSteps } from "@/lib/workflowLogic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body-based mutations on one workflow (matching /api/tasks/update's
// convention): { id, action: "update" | "confirm" | "archive" | "delete",
// and for "update": name, triggerSummary, steps }.
//
// Provenance rules enforced by lib/workflows.ts, not here: confirming or
// editing stamps confirmed_by='jordan'; editing a suggested workflow also
// confirms it (Jordan touching it is human judgment applied); ai_generated
// never flips, the origin stays truthful.

const ACTIONS = new Set(["update", "confirm", "archive", "delete"]);

export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const action = typeof body?.action === "string" ? body.action : "";
  if (!Number.isInteger(id) || id <= 0 || !ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "id and a valid action (update, confirm, archive, delete) are required." },
      { status: 400 },
    );
  }

  try {
    if (action === "update") {
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
      if (!name) {
        return NextResponse.json({ error: "A workflow name is required." }, { status: 400 });
      }
      const triggerSummary =
        typeof body?.triggerSummary === "string" && body.triggerSummary.trim()
          ? body.triggerSummary.trim().slice(0, 500)
          : null;
      const workflow = await updateWorkflow(id, {
        name,
        triggerSummary,
        steps: sanitizeSteps(body?.steps),
      });
      if (!workflow) {
        return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, workflow });
    }

    const done =
      action === "confirm"
        ? await confirmWorkflow(id)
        : action === "archive"
          ? await archiveWorkflow(id)
          : await deleteWorkflow(id);
    if (!done) {
      return NextResponse.json(
        { error: "Workflow not found or already in that state." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
