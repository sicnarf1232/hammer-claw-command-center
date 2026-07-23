import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { updateMeetingProposal } from "@/lib/proposals/store";
import { InvalidActionReviewError } from "@/lib/proposals/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Edit a pending meeting-file proposal before approval: fix a typo in the note
// content, or correct the contacts it would add (e.g. add a missing last name,
// drop someone who was actually internal). Only pending meeting files are
// editable; the store enforces that. Nothing reaches the vault here, the note
// still has to be approved in the review queue afterward.
// body: { id, content?, contactNames? }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A valid proposal id is required." }, { status: 400 });
  }

  const content = typeof body?.content === "string" ? body.content : undefined;
  const contactNames = Array.isArray(body?.contactNames)
    ? body.contactNames.map((n: unknown) => String(n))
    : undefined;
  // Structured action review decisions (Slice C). Validated to the known patch
  // shape; unknown states or malformed entries are dropped rather than stored.
  const VALID_STATES = new Set(["assigned", "unassigned", "group", "rejected", "suggested"]);
  const actionReviews = Array.isArray(body?.actionReviews)
    ? (body.actionReviews as unknown[])
        .filter(
          (r): r is Record<string, unknown> =>
            !!r &&
            typeof r === "object" &&
            typeof (r as Record<string, unknown>).actionId === "string" &&
            VALID_STATES.has(String((r as Record<string, unknown>).state)),
        )
        .map((r) => ({
          actionId: String(r.actionId),
          state: String(r.state) as "assigned" | "unassigned" | "group" | "rejected" | "suggested",
          personId:
            typeof r.personId === "number" ? r.personId : r.personId === null ? null : undefined,
          text: typeof r.text === "string" ? r.text : undefined,
          ownerText: typeof r.ownerText === "string" ? r.ownerText : undefined,
        }))
    : undefined;
  if (content === undefined && contactNames === undefined && !actionReviews?.length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const updated = await updateMeetingProposal(id, { content, contactNames, actionReviews });
    if (!updated) {
      return NextResponse.json(
        { error: "Proposal not found, already decided, or not an editable meeting file." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Invalid review input (bad or inactive person id): the client's fault,
    // reported as a 400 with the specific reason; nothing was applied.
    if (err instanceof InvalidActionReviewError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
