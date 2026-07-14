import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured, getMeetingNoteByPath } from "@/lib/vault";
import { editMeetingNote, WriteBackError } from "@/lib/writeback";
import { meetingNoteToEditable } from "@/lib/meetingEdit";
import type { MeetingEdit, EditableActionItem } from "@/lib/meetingEdit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editable JSON for a meeting note, the same shape POST accepts. Lets a
// client load the note, adjust one field, and write the full edit back.
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path.endsWith(".md") || !path.includes("/Meetings/")) {
    return NextResponse.json(
      { error: "A valid meeting-note path is required." },
      { status: 400 },
    );
  }
  const note = await getMeetingNoteByPath(path);
  if (!note) {
    return NextResponse.json({ error: "Meeting note not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, edit: meetingNoteToEditable(note) });
}

// Phase C: write an edited meeting note back to the vault as a commit.
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  if (!path || !path.endsWith(".md") || !path.includes("/Meetings/")) {
    return NextResponse.json(
      { error: "A valid meeting-note path is required." },
      { status: 400 },
    );
  }

  const edit = coerceEdit(body?.edit);
  if (!edit) {
    return NextResponse.json({ error: "Malformed edit payload." }, { status: 400 });
  }

  try {
    const res = await editMeetingNote(path, edit);
    return NextResponse.json({ ok: true, commit: res.commitSha });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const orNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

// Coerce the request body into a MeetingEdit, tolerating missing fields.
function coerceEdit(raw: unknown): MeetingEdit | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  const sections: Record<string, string> = {};
  if (e.sections && typeof e.sections === "object") {
    for (const [k, v] of Object.entries(e.sections as Record<string, unknown>)) {
      sections[k] = str(v);
    }
  }

  const attendees = Array.isArray(e.attendees)
    ? e.attendees.map(str).map((s) => s.trim()).filter(Boolean)
    : [];

  const actionItems: EditableActionItem[] = Array.isArray(e.actionItems)
    ? e.actionItems.map((a) => {
        const o = (a ?? {}) as Record<string, unknown>;
        return {
          done: o.done === true,
          isJordans: o.isJordans === true,
          owner: str(o.owner),
          text: str(o.text),
          due: str(o.due),
          priority:
            o.priority === "high" || o.priority === "med" || o.priority === "low"
              ? o.priority
              : undefined,
          customer: orNull(o.customer) ?? undefined,
          created: orNull(o.created) ?? undefined,
        };
      })
    : [];

  return {
    title: str(e.title).trim(),
    account: orNull(e.account),
    topic: orNull(e.topic),
    attendees,
    sections,
    actionItems,
  };
}
