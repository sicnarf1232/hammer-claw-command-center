import { getFile, writeFile } from "@/lib/github";
import { getMeetingNoteByPath } from "@/lib/vault";
import type { MeetingNote } from "@/lib/vault/types";
import {
  parseSeriesDoc,
  applyMeetingToSeries,
  mmdd,
} from "@/lib/vault/series";
import { buildSeriesScaffold, seriesDocPath } from "@/lib/vault/seriesCreate";
import { updateSeries } from "@/lib/ai";
import { todayISO } from "@/lib/dates";

// Server-side orchestration for "create a series" (AI-summary mode). Builds a
// fresh rolling-series doc, then folds each existing matching meeting in oldest
// to newest, summarizing it with the same machinery the Granola pull uses, so
// the new series opens with real history and a current Current State. Network +
// AI live here; the pure builders/placement are in lib/vault/seriesCreate.

export interface CreateSeriesMeeting {
  date: string; // YYYY-MM-DD
  title: string;
  noteBasename: string;
  notePath: string | null;
}

export interface CreateSeriesInput {
  name: string;
  bucket: string; // drives placement (auto by customer)
  isOneOnOne: boolean;
  participants: string[];
  cadence?: string;
  tags?: string[];
  meetings: CreateSeriesMeeting[];
}

export interface CreateSeriesResult {
  path: string;
  sessions: number;
}

const EMPTY_STATE = "(no current state captured)";

export async function createSeries(
  input: CreateSeriesInput,
): Promise<CreateSeriesResult> {
  if (!input.name?.trim()) throw new Error("A series name is required.");
  if (!input.meetings?.length)
    throw new Error("At least one meeting is required to seed the series.");

  const path = seriesDocPath(input.bucket, input.name, input.isOneOnOne);
  // Never clobber an existing doc.
  if (await getFile(path)) {
    throw new Error(`A series doc already exists at ${path}.`);
  }

  // Oldest first, so the reverse-chronological log ends up newest-on-top and
  // Current State reflects the most recent meeting with context carried forward.
  const ordered = [...input.meetings].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  let doc = buildSeriesScaffold({
    name: input.name,
    participants: input.participants,
    cadence: input.cadence,
    tags: input.tags,
    createdISO: todayISO(),
  });

  for (const m of ordered) {
    const note = m.notePath ? await getMeetingNoteByPath(m.notePath) : null;
    const summary = note ? noteSummary(note) : m.title;

    const series = parseSeriesDoc(doc, path);
    const priorState =
      series.currentState === EMPTY_STATE ? "" : series.currentState;

    const upd = await updateSeries({
      seriesName: input.name,
      cadence: input.cadence,
      currentState: priorState,
      meetingTitle: m.title,
      meetingDate: m.date,
      meetingSummary: summary,
    });

    doc = applyMeetingToSeries(
      series,
      {
        date: m.date,
        title: m.title,
        bullets: upd.logBullets,
        meetingBasename: m.noteBasename,
      },
      upd.currentState,
      mmdd(m.date),
    );
  }

  await writeFile({
    path,
    content: doc,
    message: `app: create series ${input.name} (${ordered.length} meetings)`,
  });

  return { path, sessions: ordered.length };
}

// Turn a parsed meeting note into a summary string for updateSeries. Skips the
// action-items section (the series log intentionally does not restate those).
function noteSummary(note: MeetingNote): string {
  const parts: string[] = [];
  if (note.topic) parts.push(`Topic: ${note.topic}`);
  for (const [heading, body] of Object.entries(note.sections)) {
    if (/action items/i.test(heading)) continue;
    if (!body.trim()) continue;
    parts.push(`**${heading}**\n${body.trim()}`);
  }
  return parts.join("\n\n").slice(0, 6000) || note.title;
}
