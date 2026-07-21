import {
  scoreTaskContentPair,
  type MatchableTask,
  type ScoredMatch,
} from "@/lib/taskEmailMatch";

// Pure task<->meeting matching (dev-feedback #14 Part 3): meeting notes are a
// linkable context source the same way emails are. This is a thin wrapper
// around the shared scorer in lib/taskEmailMatch.ts (scoreTaskContentPair),
// which is where the qualifying-bar logic and weights actually live, so
// emails and meetings never drift onto two different definitions of "smart."
// Suggestion-only, same as the email matcher: nothing here writes anything;
// every candidate needs Jordan's confirmation before it becomes a stored
// task_meetings link (see lib/taskMeetingLinks.ts).

export interface MatchableMeeting {
  accountName?: string | null;
  title: string;
  topic?: string | null;
  bodyMarkdown?: string | null;
  sections?: Record<string, string> | null;
  attendees?: string[] | null; // full names, e.g. "Priya Nair"
}

export interface TaskMeetingMatch extends ScoredMatch {
  taskId: string;
}

export interface MeetingMatch extends ScoredMatch {
  meetingId: number;
}

// A meeting's attendee full names collapsed to first names, the same shape
// scoreTaskContentPair expects for its personNames candidate list (mirrors
// the >= 3 char minimum lib/taskEmailMatch.ts's senderFirstName applies to a
// sender name, so "Al" doesn't false-positive against "Albuquerque").
function attendeeFirstNames(attendees: string[] | null | undefined): string[] {
  if (!attendees?.length) return [];
  const names = attendees
    .map((a) => a.trim().split(/\s+/)[0]?.replace(/[.,]/g, ""))
    .filter((n): n is string => Boolean(n) && n.length >= 3);
  return Array.from(new Set(names));
}

function collapseMeetingText(meeting: MatchableMeeting): string {
  const sectionsText = meeting.sections ? Object.values(meeting.sections).join(" ") : "";
  return [meeting.title, meeting.topic ?? "", meeting.bodyMarkdown ?? "", sectionsText]
    .filter(Boolean)
    .join(" ");
}

export function scoreTaskMeetingPair(task: MatchableTask, meeting: MatchableMeeting): ScoredMatch {
  return scoreTaskContentPair(task, {
    kind: "meeting",
    accountName: meeting.accountName,
    text: collapseMeetingText(meeting),
    personNames: attendeeFirstNames(meeting.attendees),
  });
}

// Given one open task, rank a set of candidate meetings that might inform it.
export function matchMeetingsForTask(
  task: MatchableTask,
  meetings: { meetingId: number; meeting: MatchableMeeting }[],
  limit = 5,
): MeetingMatch[] {
  return meetings
    .map(({ meetingId, meeting }) => ({ meetingId, ...scoreTaskMeetingPair(task, meeting) }))
    .filter((m) => m.qualifies)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Given one meeting, rank the open tasks it might relate to (used for the
// tasks-page "possible matches" surface and, if the meeting detail view ever
// grows one, a symmetric "linked tasks" surface there).
export function matchTasksForMeeting(
  tasks: MatchableTask[],
  meeting: MatchableMeeting,
  limit = 5,
): TaskMeetingMatch[] {
  return tasks
    .map((t) => ({ taskId: t.id, ...scoreTaskMeetingPair(t, meeting) }))
    .filter((m) => m.qualifies)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
