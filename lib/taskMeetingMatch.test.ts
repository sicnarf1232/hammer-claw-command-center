import { describe, it, expect } from "vitest";
import {
  scoreTaskMeetingPair,
  matchMeetingsForTask,
  matchTasksForMeeting,
  type MatchableMeeting,
} from "./taskMeetingMatch";
import type { MatchableTask } from "./taskEmailMatch";

describe("scoreTaskMeetingPair (dev-feedback #14 Part 3)", () => {
  it("qualifies on a shared part number", () => {
    const task: MatchableTask = { id: "t1", title: "Get PN 4521 samples out to Acme" };
    const meeting: MatchableMeeting = {
      title: "Acme quarterly review",
      sections: { "Action Items": "Ship PN 4521 samples this week." },
    };
    const { qualifies, reasons } = scoreTaskMeetingPair(task, meeting);
    expect(qualifies).toBe(true);
    expect(reasons.some((r) => r.includes("4521"))).toBe(true);
  });

  it("qualifies on an attendee named in the task, with meeting-appropriate phrasing", () => {
    const task: MatchableTask = { id: "t2", title: "Follow up with Priya on the forecast" };
    const meeting: MatchableMeeting = {
      title: "Forecast sync",
      attendees: ["Priya Nair", "Jordan Francis"],
    };
    const { qualifies, reasons } = scoreTaskMeetingPair(task, meeting);
    expect(qualifies).toBe(true);
    expect(reasons.some((r) => r.includes("Priya") && r.includes("meeting"))).toBe(true);
  });

  it("same account alone does NOT qualify (same bar as the email matcher)", () => {
    const task: MatchableTask = { id: "t3", title: "Follow up on outstanding balance", customer: "Acme Corp" };
    const meeting: MatchableMeeting = {
      title: "Weekly check-in",
      accountName: "Acme Corp",
      sections: { "Full Notes": "General catch-up, nothing specific." },
    };
    const { qualifies } = scoreTaskMeetingPair(task, meeting);
    expect(qualifies).toBe(false);
  });

  it("does not false-positive on a too-short attendee first name", () => {
    const task: MatchableTask = { id: "t4", title: "Update the Scots Valley shipping address" };
    const meeting: MatchableMeeting = { title: "Ops sync", attendees: ["Al B"] };
    const { qualifies } = scoreTaskMeetingPair(task, meeting);
    expect(qualifies).toBe(false);
  });
});

describe("matchMeetingsForTask / matchTasksForMeeting", () => {
  const task: MatchableTask = { id: "t1", title: "Get PN 4521 samples out to Acme" };
  const meetings = [
    {
      meetingId: 1,
      meeting: {
        title: "Acme quarterly review",
        sections: { "Action Items": "Ship PN 4521 samples this week." },
      } as MatchableMeeting,
    },
    {
      meetingId: 2,
      meeting: { title: "Unrelated internal standup", sections: { "Full Notes": "Nothing relevant." } } as MatchableMeeting,
    },
  ];

  it("matchMeetingsForTask only surfaces the qualifying meeting", () => {
    const result = matchMeetingsForTask(task, meetings);
    expect(result.map((m) => m.meetingId)).toEqual([1]);
  });

  it("matchTasksForMeeting is the mirror direction", () => {
    const result = matchTasksForMeeting([task], meetings[0].meeting);
    expect(result.map((m) => m.taskId)).toEqual(["t1"]);
  });
});
