import { getFile, writeFile } from "@/lib/github";
import { getMeetingNoteByPath, getSeriesByPath } from "@/lib/vault";
import { cutoverActive } from "@/lib/dbSource";
import { dbSaveSeriesContent } from "@/lib/meetingsDb";
import type { MeetingNote } from "@/lib/vault/types";
import {
  parseSeriesDoc,
  applyMeetingToSeries,
  mmdd,
} from "@/lib/vault/series";
import {
  buildSeriesScaffold,
  seriesDocPath,
  isOneOnOneName,
} from "@/lib/vault/seriesCreate";
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
  skipped?: string[]; // meetings whose fold failed after a retry
}

const EMPTY_STATE = "(no current state captured)";

export async function createSeries(
  input: CreateSeriesInput,
): Promise<CreateSeriesResult> {
  if (!input.name?.trim()) throw new Error("A series name is required.");
  if (!input.meetings?.length)
    throw new Error("At least one meeting is required to seed the series.");

  const path = seriesDocPath(input.bucket, input.name, input.isOneOnOne);
  // Never clobber an existing doc (DB-first check post-cutover).
  const dbActive = await cutoverActive();
  const exists = dbActive
    ? (await getSeriesByPath(path)) !== null
    : (await getFile(path)) !== null;
  if (exists) {
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

  const fold = await foldMeetingsIntoDoc(doc, path, input.name, input.cadence, ordered);
  doc = fold.doc;

  if (dbActive) {
    // User-initiated creation: the row is the canonical doc (origin 'app');
    // the vault copy lands on the next export.
    await dbSaveSeriesContent(path, doc, "app");
  } else {
    await writeFile({
      path,
      content: doc,
      message: `app: create series ${input.name} (${ordered.length} meetings)`,
    });
  }

  return { path, sessions: fold.folded, skipped: fold.skipped };
}

export interface CreateManualSeriesInput {
  name: string;
  accountName?: string; // drives placement; blank means Internal
  cadence?: string;
  participants: string[]; // key customer attendees
  keywords: string[]; // title keywords for matching
  // Past meetings selected in the form: folded into the rolling doc at
  // creation so the series opens with real history, not 0 sessions.
  meetings?: CreateSeriesMeeting[];
}

// Manual pre-seeding: Jordan declares a recurring series by hand. The
// scaffold carries explicit matchRules (title keywords + key attendees) so
// the next Granola pull links matching meetings automatically. When past
// meetings are selected, they are folded into the rolling log the same way
// the AI-summary create does. DB-only, origin 'app'; the vault copy lands
// on the next export.
export async function createManualSeries(
  input: CreateManualSeriesInput,
): Promise<CreateSeriesResult> {
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("A series name is required.");
  const participants = input.participants.map((p) => p.trim()).filter(Boolean);
  const keywords = input.keywords.map((k) => k.trim()).filter(Boolean);
  if (!participants.length && !keywords.length) {
    throw new Error(
      "Add at least one attendee or title keyword so future meetings can match.",
    );
  }

  const dbActive = await cutoverActive();
  if (!dbActive) {
    throw new Error("Manual series creation requires the app database.");
  }

  const bucket = input.accountName?.trim() || "Internal";
  const path = seriesDocPath(bucket, name, isOneOnOneName(name));
  if ((await getSeriesByPath(path)) !== null) {
    throw new Error(`A series doc already exists at ${path}.`);
  }

  let doc = buildSeriesScaffold({
    name,
    participants,
    cadence: input.cadence,
    createdISO: todayISO(),
    matchRules: { titleContains: keywords, attendeesInclude: participants },
  });

  const ordered = [...(input.meetings ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  let folded = 0;
  let skipped: string[] = [];
  if (ordered.length) {
    const fold = await foldMeetingsIntoDoc(doc, path, name, input.cadence, ordered);
    doc = fold.doc;
    folded = fold.folded;
    skipped = fold.skipped;
  }

  await dbSaveSeriesContent(path, doc, "app");
  return { path, sessions: folded, skipped };
}

// Fold meetings into a series doc oldest to newest: each one is summarized
// from its note, run through the series updater, and appended to the rolling
// log with Current State carried forward. Shared by the AI-summary create
// and the manual create when it is seeded from past meetings.
async function foldMeetingsIntoDoc(
  doc: string,
  path: string,
  seriesName: string,
  cadence: string | undefined,
  ordered: CreateSeriesMeeting[],
): Promise<{ doc: string; folded: number; skipped: string[] }> {
  let out = doc;
  let folded = 0;
  const skipped: string[] = [];
  for (const m of ordered) {
    try {
      const note = m.notePath ? await getMeetingNoteByPath(m.notePath) : null;
      const summary = note ? noteSummary(note) : m.title;

      const series = parseSeriesDoc(out, path);
      const priorState =
        series.currentState === EMPTY_STATE ? "" : series.currentState;

      const upd = await updateSeries({
        seriesName,
        cadence,
        currentState: priorState,
        meetingTitle: m.title,
        meetingDate: m.date,
        meetingSummary: summary,
      });

      out = applyMeetingToSeries(
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
      folded += 1;
    } catch (err) {
      // One stubborn meeting must not kill the whole series create; the
      // series lands with the rest and the skip is reported.
      console.error(`[createSeries] fold failed for "${m.title}":`, err);
      skipped.push(m.title);
    }
  }
  return { doc: out, folded, skipped };
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
