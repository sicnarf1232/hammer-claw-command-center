import { NextResponse, type NextRequest } from "next/server";
import { cutoverActive } from "@/lib/dbSource";
import { todayISO } from "@/lib/dates";
import {
  meetingBasename,
  meetingFolder,
  renderManualMeetingNote,
} from "@/lib/meetingFormat";
import { dbCreateMeeting } from "@/lib/meetingsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manually file a meeting note (no Granola pull). Renders the canonical note
// markdown and inserts the meetings row DB-first (origin "app"); the vault
// copy appears on the next export. 409 when a note already claims the path.
export async function POST(req: NextRequest) {
  if (!(await cutoverActive())) {
    return NextResponse.json(
      { error: "Manual notes write to the app database; cutover is not active." },
      { status: 503 },
    );
  }
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const account = typeof body?.account === "string" ? body.account.trim() : "";
  const date =
    typeof body?.date === "string" && body.date.trim() ? body.date.trim() : todayISO();
  const attendees =
    typeof body?.attendees === "string"
      ? body.attendees.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
  const noteBody = typeof body?.body === "string" ? body.body : "";
  if (!title) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
  }

  // Stable vault-style identity: account folder when linked, else Internal.
  const folder = meetingFolder("merit", account || null, account ? undefined : "Internal");
  const path = `${folder}/${meetingBasename(date, title)}.md`;
  const content = renderManualMeetingNote({
    title,
    date,
    createdISO: todayISO(),
    account: account || null,
    attendees,
    body: noteBody,
  });

  try {
    const res = await dbCreateMeeting(path, content);
    if (!res.created) {
      return NextResponse.json(
        { error: `A meeting note already exists for that date and title.`, path },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
