import { NextResponse, type NextRequest } from "next/server";
import { createManualSeries } from "@/lib/createSeries";
import { dbLinkMeetingsToSeries } from "@/lib/meetingsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Canonical cadence labels for the manual create form's four options.
const CADENCES: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  "ad hoc": "Ad hoc",
};

// Create a rolling series by hand. No AI call and no vault write: the scaffold
// doc (with explicit matchRules) is saved to the DB and future Granola pulls
// link matching meetings to it. Optional meetingPaths (the past meetings the
// form was seeded from) get linked to the new series by series_id.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const accountName =
    typeof b.accountName === "string" && b.accountName.trim()
      ? b.accountName.trim()
      : undefined;
  const cadenceRaw = typeof b.cadence === "string" ? b.cadence.trim() : "";
  const cadence = cadenceRaw ? CADENCES[cadenceRaw.toLowerCase()] : undefined;
  const participants = strArray(b.participants);
  const keywords = strArray(b.keywords);
  const meetingPaths = strArray(b.meetingPaths);

  if (!name) {
    return NextResponse.json({ error: "A series name is required." }, { status: 400 });
  }
  if (cadenceRaw && !cadence) {
    return NextResponse.json(
      { error: "Cadence must be weekly, biweekly, monthly, or ad hoc." },
      { status: 400 },
    );
  }
  if (!participants.length && !keywords.length) {
    return NextResponse.json(
      { error: "Add at least one attendee or title keyword so future meetings can match." },
      { status: 400 },
    );
  }

  try {
    const res = await createManualSeries({
      name,
      accountName,
      cadence,
      participants,
      keywords,
    });
    const linked = meetingPaths.length
      ? await dbLinkMeetingsToSeries(res.path, meetingPaths)
      : 0;
    return NextResponse.json({
      ok: true,
      path: res.path,
      sessions: res.sessions,
      linked,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed.";
    const status = /already exists/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function strArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.map((x) => String(x).trim()).filter(Boolean)
    : [];
}
