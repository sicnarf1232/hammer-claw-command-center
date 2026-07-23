import { describe, it, expect } from "vitest";
import { meetingApprovalPlan } from "./executeMeeting";

// Codex D-review blocker 2: the decision boundary for the post-cutover
// approval write. Characterized pure (no DB harness in this repo):
//
//  - a NEW meeting saves content + reviewed links (dbSaveMeetingContent with
//    the structured contract);
//  - an EXISTING meeting preserves its stored content and reconciles the
//    reviewed links against it (dbReconcileMeetingActions), which THROWS on
//    failure so the proposal lands in status 'error' via the caller's
//    markError, never a false success (see reconcileBlocker tests in
//    lib/meetingTaskSync.test.ts for the failure conditions);
//  - only a legacy payload with no structured actions may still skip, since
//    it has no reviewed links to lose.

describe("meetingApprovalPlan", () => {
  it("new meeting: content and reviewed links save", () => {
    expect(meetingApprovalPlan(false, true)).toBe("save-new");
    expect(meetingApprovalPlan(false, false)).toBe("save-new");
  });

  it("meeting already exists with reviewed actions: reconcile, do not skip", () => {
    expect(meetingApprovalPlan(true, true)).toBe("reconcile-existing");
  });

  it("meeting already exists with a legacy payload: skip is still correct", () => {
    expect(meetingApprovalPlan(true, false)).toBe("skip-legacy");
  });
});
