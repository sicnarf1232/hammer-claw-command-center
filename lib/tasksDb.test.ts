import { describe, it, expect } from "vitest";
import { rowToTask, DB_TASK_FILE } from "./tasksDb";

// Pure mapping test for the source-meeting join columns (plan section 8).
// rowToTask is exported for this test only; no behavior change.

const ROW = {
  id: 12,
  meetingId: 7,
  ownerPersonId: null,
  accountId: null,
  text: "Send the forecast",
  done: false,
  due: null,
  priority: null,
  status: null,
  isJordans: true,
  description: null,
  notes: null,
  workstream: null,
  customer: null,
  createdField: null,
  scheduled: null,
  thread: null,
  completed: null,
  fields: null,
  sourcePath: null,
  sourceLine: null,
  actionId: null,
  origin: "proposal",
  confirmedBy: "jordan",
  supersededBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("rowToTask: source-meeting mapping", () => {
  it("maps the joined meeting columns into sourceMeeting", () => {
    const t = rowToTask(ROW, null, null, {
      meetingRowId: 7,
      meetingTitle: "Intuitive weekly sync",
      meetingDate: "2026-07-20",
      meetingPath: "300 Merit/Meetings/x.md",
    });
    expect(t.sourceMeeting).toEqual({
      id: 7,
      title: "Intuitive weekly sync",
      date: "2026-07-20",
      path: "300 Merit/Meetings/x.md",
    });
  });

  it("null meeting columns (no meeting_id, or meeting gone) map to undefined", () => {
    const t = rowToTask(ROW, null, null, {
      meetingRowId: null,
      meetingTitle: null,
      meetingDate: null,
      meetingPath: null,
    });
    expect(t.sourceMeeting).toBeUndefined();
    expect(rowToTask(ROW, null, null, null).sourceMeeting).toBeUndefined();
    expect(rowToTask(ROW).sourceMeeting).toBeUndefined();
  });

  it("app-created rows keep their DB coordinates", () => {
    const t = rowToTask(ROW);
    expect(t.sourceFile).toBe(DB_TASK_FILE);
    expect(t.sourceLine).toBe(12);
  });
});
