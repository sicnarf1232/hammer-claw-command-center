import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { createSeries, type CreateSeriesMeeting } from "@/lib/createSeries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a new rolling-series doc from a detected recurring meeting. Reads each
// matching note, AI-summarizes it into the log + Current State, and commits the
// new doc to the vault. Placement is auto by bucket (lib/vault/seriesCreate).
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const bucket = typeof b.bucket === "string" && b.bucket.trim() ? b.bucket.trim() : "Internal";
  const isOneOnOne = b.isOneOnOne === true;
  const cadence = typeof b.cadence === "string" && b.cadence.trim() ? b.cadence.trim() : undefined;
  const participants = strArray(b.participants);
  const tags = strArray(b.tags);
  const meetings = coerceMeetings(b.meetings);

  if (!name) {
    return NextResponse.json({ error: "A series name is required." }, { status: 400 });
  }
  if (!meetings.length) {
    return NextResponse.json(
      { error: "At least one meeting is required to seed the series." },
      { status: 400 },
    );
  }

  try {
    const res = await createSeries({
      name,
      bucket,
      isOneOnOne,
      participants,
      cadence,
      tags,
      meetings,
    });
    return NextResponse.json({ ok: true, path: res.path, sessions: res.sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed.";
    // An existing-doc collision is the user's to resolve, not a server fault.
    const status = /already exists/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function strArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.map((x) => String(x).trim()).filter(Boolean)
    : [];
}

function coerceMeetings(v: unknown): CreateSeriesMeeting[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((m): CreateSeriesMeeting | null => {
      const o = (m ?? {}) as Record<string, unknown>;
      const date = typeof o.date === "string" ? o.date.trim() : "";
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const noteBasename = typeof o.noteBasename === "string" ? o.noteBasename.trim() : "";
      if (!date || !title) return null;
      return {
        date,
        title,
        noteBasename: noteBasename || `${date} - ${title}`,
        notePath: typeof o.notePath === "string" && o.notePath ? o.notePath : null,
      };
    })
    .filter((m): m is CreateSeriesMeeting => m !== null);
}
