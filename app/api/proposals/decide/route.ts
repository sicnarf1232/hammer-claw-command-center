import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import {
  getProposal,
  rejectProposal,
  markExecuted,
  markError,
} from "@/lib/proposals/store";
import {
  executeProposal,
  rebuildIndexAfterApprovals,
} from "@/lib/proposals/executeMeeting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Approvals commit to the vault one proposal at a time; give a batch room.
export const maxDuration = 300;

interface DecideBody {
  ids: number[];
  action: "approve" | "reject";
}

export interface DecideOutcome {
  id: number;
  status: "approved" | "rejected" | "error" | "skipped";
  detail?: string;
}

// Approve or reject proposals, batch-capable. Approval executes the frozen
// payload inline (this is the ONLY path from AI output to a vault write) and
// returns per-id outcomes; a failure on one proposal does not stop the rest.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as DecideBody | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((n): n is number => Number.isInteger(n))
    : [];
  const action = body?.action;
  if (!ids.length || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "Body must be { ids: number[], action: 'approve' | 'reject' }." },
      { status: 400 },
    );
  }

  const outcomes: DecideOutcome[] = [];

  if (action === "reject") {
    for (const id of ids) {
      try {
        await rejectProposal(id);
        outcomes.push({ id, status: "rejected" });
      } catch (err) {
        outcomes.push({
          id,
          status: "error",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return NextResponse.json({ ok: true, outcomes });
  }

  // Approve: meeting notes before series updates so a series entry never
  // references a note that has not landed yet. Sequential on purpose (atomic
  // vault commits, and partial progress is returned if the batch runs long).
  const rows = (
    await Promise.all(ids.map((id) => getProposal(id)))
  ).filter((r): r is NonNullable<typeof r> => r !== null);
  const ordered = [
    ...rows.filter((r) => r.kind === "meeting-file"),
    ...rows.filter((r) => r.kind !== "meeting-file"),
  ];

  let indexRebuildNeeded = false;
  for (const row of ordered) {
    if (row.status !== "pending") {
      outcomes.push({
        id: row.id,
        status: "skipped",
        detail: `not pending (${row.status})`,
      });
      continue;
    }
    try {
      const res = await executeProposal(row);
      indexRebuildNeeded = indexRebuildNeeded || res.indexRebuildNeeded;
      await markExecuted(row.id, res.warnings.length ? res.warnings.join(" | ") : null);
      outcomes.push({
        id: row.id,
        status: "approved",
        detail: res.warnings.length ? res.warnings.join(" | ") : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markError(row.id, message).catch(() => {});
      outcomes.push({ id: row.id, status: "error", detail: message });
    }
  }

  if (indexRebuildNeeded) {
    try {
      await rebuildIndexAfterApprovals();
    } catch (err) {
      outcomes.push({
        id: -1,
        status: "error",
        detail: `index rebuild: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({ ok: true, outcomes });
}
