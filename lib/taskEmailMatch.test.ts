import { describe, it, expect } from "vitest";
import {
  extractPartNumberTokens,
  scoreTaskEmailPair,
  matchTasksForEmail,
  matchEmailsForTask,
  type MatchableTask,
  type MatchableEmail,
} from "./taskEmailMatch";

describe("extractPartNumberTokens", () => {
  it("finds alphanumeric part-number-shaped tokens", () => {
    expect(extractPartNumberTokens("Drawing for PN 1234 attached")).toContain("1234");
    expect(extractPartNumberTokens("Quote for MSS031 and AB-2201-R2")).toEqual(
      expect.arrayContaining(["MSS031", "AB-2201-R2"]),
    );
  });

  it("excludes plain words and years", () => {
    expect(extractPartNumberTokens("Meeting in 2026 about the plan")).not.toContain("2026");
    expect(extractPartNumberTokens("Just some words here")).toEqual([]);
  });

  it("excludes short digit runs that are too generic", () => {
    expect(extractPartNumberTokens("call me at 5pm re: item 12")).not.toContain("12");
  });
});

describe("scoreTaskEmailPair", () => {
  const baseTask: MatchableTask = {
    id: "t1",
    title: "Provide Customer X with drawing for PN 1234",
    description: "Scott owns the drawing, chase him if it goes quiet.",
    notes: "",
    customer: "Customer X",
  };

  it("Jordan's worked example: engineer replies with the part number the task names", () => {
    const email: MatchableEmail = {
      accountName: null, // internal reply from Scott, no customer account
      subject: "Drawing for PN 1234",
      bodyText: "Hey Jordan, here is the drawing for PN 1234.",
      fromName: "Scott Anderson",
      fromEmail: "scott.anderson@merit.com",
    };
    const { score, reasons } = scoreTaskEmailPair(baseTask, email);
    expect(score).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes("1234"))).toBe(true);
    expect(reasons.some((r) => r.includes("Scott"))).toBe(true);
  });

  it("scores same-account emails even with no shared keywords", () => {
    const task: MatchableTask = {
      id: "t2",
      title: "Follow up on outstanding balance",
      customer: "Acme Corp",
    };
    const email: MatchableEmail = {
      accountName: "Acme Corp",
      subject: "Quick question",
      bodyText: "Totally unrelated content here.",
    };
    const { score, reasons } = scoreTaskEmailPair(task, email);
    expect(score).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes("Acme Corp"))).toBe(true);
  });

  it("never matches on account for internal tasks", () => {
    const task: MatchableTask = { id: "t3", title: "Internal reminder", customer: "internal" };
    const email: MatchableEmail = { accountName: "internal", subject: "x", bodyText: "y" };
    const { reasons } = scoreTaskEmailPair(task, email);
    expect(reasons.some((r) => r.includes("Same account"))).toBe(false);
  });

  it("scores zero for genuinely unrelated task and email", () => {
    const task: MatchableTask = { id: "t4", title: "Renew the parking permit", customer: "internal" };
    const email: MatchableEmail = {
      accountName: "Some Other Co",
      subject: "Newsletter: industry roundup",
      bodyText: "Here is this week's roundup of unrelated news.",
    };
    const { score } = scoreTaskEmailPair(task, email);
    expect(score).toBe(0);
  });

  it("requires a whole-word, minimum-length name match (no false positive on short/partial names)", () => {
    const task: MatchableTask = { id: "t5", title: "Update the Scots Valley shipping address" };
    const email: MatchableEmail = {
      subject: "hi",
      bodyText: "just checking in",
      fromName: "Sc",
    };
    const { score } = scoreTaskEmailPair(task, email);
    expect(score).toBe(0);
  });
});

describe("matchTasksForEmail", () => {
  const email: MatchableEmail = {
    accountName: null,
    subject: "Drawing for PN 1234",
    bodyText: "Hey Jordan, here is the drawing for PN 1234.",
    fromName: "Scott Anderson",
    fromEmail: "scott.anderson@merit.com",
  };
  const tasks: MatchableTask[] = [
    {
      id: "match",
      title: "Provide Customer X with drawing for PN 1234",
      description: "Scott owns the drawing.",
      customer: "Customer X",
    },
    { id: "unrelated", title: "Renew the parking permit", customer: "internal" },
  ];

  it("ranks the plausible task above the unrelated one and excludes zero scores", () => {
    const result = matchTasksForEmail(tasks, email);
    expect(result.map((r) => r.taskId)).toEqual(["match"]);
    expect(result[0].reasons.length).toBeGreaterThan(0);
  });

  it("respects the limit", () => {
    const many: MatchableTask[] = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      title: `Task about PN 1234 for account ${i}`,
    }));
    const result = matchTasksForEmail(many, email, 3);
    expect(result.length).toBe(3);
  });

  it("sorts descending by score", () => {
    const strong: MatchableTask = {
      id: "strong",
      title: "PN 1234 drawing, ask Scott",
      customer: "Customer X",
    };
    const weak: MatchableTask = { id: "weak", title: "Mentions drawing only" };
    const result = matchTasksForEmail([weak, strong], { ...email, accountName: "Customer X" });
    expect(result[0].taskId).toBe("strong");
  });
});

describe("matchEmailsForTask (reverse direction, for the tasks-page surface)", () => {
  const task: MatchableTask = {
    id: "t1",
    title: "Provide Customer X with drawing for PN 1234",
    description: "Scott owns the drawing.",
    customer: "Customer X",
  };

  it("finds the matching email among a set of candidates", () => {
    const candidates = [
      {
        key: "e1",
        email: {
          subject: "Drawing for PN 1234",
          bodyText: "Here is the drawing for PN 1234.",
          fromName: "Scott Anderson",
        } as MatchableEmail,
      },
      {
        key: "e2",
        email: { subject: "Lunch?", bodyText: "Want to grab lunch today?" } as MatchableEmail,
      },
    ];
    const result = matchEmailsForTask(task, candidates);
    expect(result.map((r) => r.emailKey)).toEqual(["e1"]);
  });
});
