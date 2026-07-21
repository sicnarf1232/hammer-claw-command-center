import { linkedEmailsForTask } from "@/lib/taskEmailLinks";
import { linkedMeetingsForTask } from "@/lib/taskMeetingLinks";
import { getCachedEmailExtractions } from "@/lib/emailExtraction";

// Cheap grounding for the suggested-action classifier and its draft-email
// generator (dev-feedback #21). "Cheap" is the whole point: this reads ONLY
// what is already confirmed-linked to the task and already cached (linked
// rows themselves, plus the existing ask/provide extraction cache from
// lib/emailExtraction.ts), never a fresh AI call or a new full-body fetch.
// That keeps it fast enough to run on every task-detail expand.

export interface TaskActionContext {
  meetingContext: string;
  emailContext: string;
  // The first confirmed-linked meeting with a real vault path, so the caller
  // can show "grounded in meeting note: X" as a WORKING link (dev-feedback
  // #21 item 3), the same /meetings?note= pattern TaskLinkedMeetings uses.
  linkedMeetingNote: { title: string; sourcePath: string } | null;
}

const EMPTY_CONTEXT: TaskActionContext = {
  meetingContext: "",
  emailContext: "",
  linkedMeetingNote: null,
};

export async function gatherTaskActionContext(
  sourceFile: string,
  sourceLine: number,
): Promise<TaskActionContext> {
  const [meetings, emails] = await Promise.all([
    linkedMeetingsForTask(sourceFile, sourceLine).catch(() => []),
    linkedEmailsForTask(sourceFile, sourceLine).catch(() => []),
  ]);
  if (!meetings.length && !emails.length) return EMPTY_CONTEXT;

  const meetingContext = meetings
    .map((m) => {
      const parts = [m.title || "(untitled meeting)"];
      if (m.date) parts.push(`(${m.date})`);
      const line = parts.join(" ");
      return m.accountName ? `${line}, ${m.accountName}` : line;
    })
    .join("\n");

  const extractions = await getCachedEmailExtractions(emails.map((e) => e.emailId)).catch(
    () => new Map(),
  );
  const emailContext = emails
    .map((e) => {
      const lines = [`${e.subject || "(no subject)"}${e.fromName ? `, from ${e.fromName}` : ""}`];
      const ex = extractions.get(e.emailId);
      if (ex?.asks.length) lines.push(`Asks: ${ex.asks.join("; ")}`);
      if (ex?.provides.length) lines.push(`Provides: ${ex.provides.join("; ")}`);
      return lines.join(". ");
    })
    .join("\n");

  const firstNote = meetings.find((m) => m.sourcePath);
  const linkedMeetingNote = firstNote?.sourcePath
    ? { title: firstNote.title || "Untitled meeting", sourcePath: firstNote.sourcePath }
    : null;

  return { meetingContext, emailContext, linkedMeetingNote };
}
