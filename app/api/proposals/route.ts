import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { listProposals } from "@/lib/proposals/store";
import type { ProposalStatus } from "@/lib/proposals/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: ProposalStatus[] = [
  "pending",
  "approved",
  "rejected",
  "error",
  "expired",
  "superseded",
];

// List AI proposals (default: pending). Read-only; deciding happens via
// POST /api/proposals/decide.
export async function GET(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ ok: true, proposals: [] });
  }
  const raw = req.nextUrl.searchParams.get("status") ?? "pending";
  const status = (STATUSES as string[]).includes(raw)
    ? (raw as ProposalStatus)
    : "pending";
  try {
    const proposals = await listProposals(status);
    return NextResponse.json({ ok: true, proposals });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
