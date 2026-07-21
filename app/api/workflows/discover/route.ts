import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { aiConfigured, discoverWorkflows } from "@/lib/ai";
import { gatherWorkflowEvidence } from "@/lib/workflowDiscovery";
import { insertSuggestedWorkflows } from "@/lib/workflows";
import { normalizeEvidence, sanitizeSteps } from "@/lib/workflowLogic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One Opus synthesis pass over a bounded corpus; same ceiling as the other
// long AI routes (app/api/series/manual/route.ts).
export const maxDuration = 300;

// The Main St. AI discovery pass (Jordan-triggered only, no cron): assemble a
// bounded evidence corpus from existing data (lib/workflowDiscovery.ts, narrow
// columns, never email bodies), ask model() (Opus) to identify recurring
// end-to-end processes, and persist them as status='suggested' workflow rows
// with honest provenance (ai_generated=true, the true model id from the API
// response, and the concrete evidence that led to each suggestion). Dedupe:
// a suggestion whose normalized name matches an existing non-archived
// workflow is skipped (rule documented in lib/workflowLogic.ts). Suggestions
// only; Jordan confirms, edits, or dismisses on /agents. Nothing executes.

export async function POST() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Discovery is unavailable." },
      { status: 503 },
    );
  }

  try {
    const { corpus, itemCount } = await gatherWorkflowEvidence();
    if (itemCount < 5) {
      return NextResponse.json({
        ok: true,
        suggested: 0,
        skipped: 0,
        itemCount,
        note: "Not enough activity yet to map workflows. Work the inbox and tasks for a while, then run this again.",
      });
    }

    const { workflows, modelUsed } = await discoverWorkflows({ corpus });
    const { inserted, skipped } = await insertSuggestedWorkflows(
      workflows.map((w) => ({
        name: w.name,
        triggerSummary: w.triggerSummary || null,
        steps: sanitizeSteps(w.steps),
        evidence: normalizeEvidence(w.evidence),
      })),
      modelUsed,
    );

    return NextResponse.json({ ok: true, suggested: inserted, skipped, itemCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
