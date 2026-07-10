import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured, deriveSeriesRules, type DeriveSeriesMeeting } from "@/lib/ai";
import { meetingNoteByPathFromDb } from "@/lib/meetingsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_MEETINGS = 2;
const MAX_MEETINGS = 12;

// Derive New Series fields from past meetings Jordan selected: load the notes
// from the DB (attendees come from each note's frontmatter and body via the
// meeting parser), then Opus proposes name, account, cadence, participants,
// and title keywords. Read-only; Jordan reviews the fields and creates via
// POST /api/series/manual as before.
export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI is not configured (ANTHROPIC_API_KEY unset)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const rawPaths = (body as Record<string, unknown>).paths;
  const paths = Array.isArray(rawPaths)
    ? Array.from(
        new Set(
          rawPaths
            .filter((p): p is string => typeof p === "string")
            .map((p) => p.trim())
            .filter(Boolean),
        ),
      )
    : [];
  if (paths.length < MIN_MEETINGS || paths.length > MAX_MEETINGS) {
    return NextResponse.json(
      { error: `Select ${MIN_MEETINGS} to ${MAX_MEETINGS} meetings to derive from.` },
      { status: 400 },
    );
  }

  const meetings: DeriveSeriesMeeting[] = [];
  for (const path of paths) {
    const note = await meetingNoteByPathFromDb(path);
    if (!note) continue;
    meetings.push({
      title: note.title,
      date: note.date ?? null,
      account: note.customer?.display ?? note.customer?.basename ?? null,
      attendees: note.attendees,
    });
  }
  if (!meetings.length) {
    return NextResponse.json(
      { error: "None of the selected meetings were found in the database." },
      { status: 404 },
    );
  }

  try {
    const derived = await deriveSeriesRules({ meetings });
    return NextResponse.json({
      ok: true,
      name: derived.name,
      accountName: derived.accountName,
      cadence: derived.cadence,
      participants: derived.participants,
      keywords: derived.keywords,
      modelUsed: derived.modelUsed,
      meetingsUsed: meetings.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Derivation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
