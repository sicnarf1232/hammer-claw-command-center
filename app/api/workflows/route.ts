import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { listWorkflows, createManualWorkflow } from "@/lib/workflows";
import { sanitizeSteps } from "@/lib/workflowLogic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Workflows (Main St. AI): GET lists everything for the /agents Workflows
// section; POST creates a MANUAL workflow (Jordan wrote it, so it is born
// confirmed with ai_generated=false, per lib/workflows.ts). Behind the cookie
// middleware like every non-public route.

export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const workflows = await listWorkflows();
  return NextResponse.json({ workflows });
}

export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) {
    return NextResponse.json({ error: "A workflow name is required." }, { status: 400 });
  }
  const triggerSummary =
    typeof body?.triggerSummary === "string" && body.triggerSummary.trim()
      ? body.triggerSummary.trim().slice(0, 500)
      : null;
  const steps = sanitizeSteps(body?.steps);

  try {
    const workflow = await createManualWorkflow({ name, triggerSummary, steps });
    return NextResponse.json({ ok: true, workflow });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
