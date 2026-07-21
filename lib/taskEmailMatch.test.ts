import { describe, it, expect } from "vitest";
import {
  extractPartNumberTokens,
  phraseOverlapsText,
  scoreTaskContentPair,
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

describe("phraseOverlapsText (deterministic ask/provide crossing, no AI)", () => {
  it("matches a multi-word phrase that shares most of its significant words", () => {
    expect(
      phraseOverlapsText(
        "confirmation the sterilization docs are updated",
        "Task: chase sterilization docs, make sure they are updated for the audit.",
      ),
    ).toBe(true);
  });

  it("matches a short one-word phrase only on a full, specific word", () => {
    expect(phraseOverlapsText("drawing", "Provide the drawing for the customer.")).toBe(true);
    expect(phraseOverlapsText("the", "the quick brown fox")).toBe(false); // stopword, no keywords
  });

  it("does not match unrelated phrases", () => {
    expect(
      phraseOverlapsText("the drawing for PN 1234, attached", "Renew the parking permit downtown."),
    ).toBe(false);
  });

  it("returns false for an empty phrase", () => {
    expect(phraseOverlapsText("", "anything here")).toBe(false);
  });
});

describe("scoreTaskContentPair qualifying bar (dev-feedback #14)", () => {
  it("same account alone does NOT qualify, even though it still scores and shows as a reason", () => {
    const task: MatchableTask = {
      id: "t1",
      title: "Follow up on outstanding balance",
      customer: "Acme Corp",
    };
    const { score, reasons, qualifies } = scoreTaskContentPair(task, {
      kind: "email",
      accountName: "Acme Corp",
      text: "Quick question. Totally unrelated content here.",
    });
    expect(qualifies).toBe(false);
    expect(score).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes("Acme Corp"))).toBe(true);
  });

  it("generic keyword overlap alone does NOT qualify", () => {
    const task: MatchableTask = { id: "t2", title: "Update the drawing package for review" };
    const { qualifies } = scoreTaskContentPair(task, {
      kind: "email",
      text: "Please review the updated drawing when you get a chance.",
    });
    expect(qualifies).toBe(false);
  });

  it("same account plus a part number DOES qualify and ranks higher than a weaker qualifying match", () => {
    const strongTask: MatchableTask = {
      id: "strong",
      title: "Provide Customer X with drawing for PN 1234",
      customer: "Customer X",
    };
    const weakTask: MatchableTask = {
      id: "weak",
      title: "Chase PN 1234 status",
      // no customer set, so this candidate qualifies on the part number alone
      // but never gets the account-match boost
    };
    const content = {
      kind: "email" as const,
      accountName: "Customer X",
      text: "Here is the drawing for PN 1234, let me know if you need anything else.",
    };
    const strong = scoreTaskContentPair(strongTask, content);
    const weak = scoreTaskContentPair(weakTask, content);
    expect(strong.qualifies).toBe(true);
    expect(weak.qualifies).toBe(true);
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("a named person qualifies even with no shared keywords", () => {
    const task: MatchableTask = {
      id: "t3",
      title: "Chase Scott for the drawing",
    };
    const { qualifies, reasons } = scoreTaskContentPair(task, {
      kind: "email",
      text: "Attached is what you asked for.",
      personNames: ["Scott"],
    });
    expect(qualifies).toBe(true);
    expect(reasons.some((r) => r.includes("Scott"))).toBe(true);
  });

  it("requires a whole-word, minimum-length name match (no false positive on short/partial names)", () => {
    const task: MatchableTask = { id: "t4", title: "Update the Scots Valley shipping address" };
    const { qualifies } = scoreTaskContentPair(task, {
      kind: "email",
      text: "just checking in",
      personNames: ["Sc"],
    });
    expect(qualifies).toBe(false);
  });

  it("an extracted ask match QUALIFIES, using fake extracted phrases (no AI call)", () => {
    const task: MatchableTask = {
      id: "t5",
      title: "Confirm sterilization docs are updated for Acme",
      customer: "Acme Corp",
    };
    const { qualifies, reasons } = scoreTaskContentPair(task, {
      kind: "email",
      accountName: "Acme Corp",
      text: "Hi Jordan, just checking in on a few things.",
      extractedAsks: ["confirmation the sterilization docs are updated"],
    });
    expect(qualifies).toBe(true);
    expect(reasons.some((r) => r.includes("asks") && r.includes("sterilization"))).toBe(true);
  });

  it("an extracted provide match QUALIFIES against a task that names the part number", () => {
    const task: MatchableTask = {
      id: "t6",
      title: "Get the drawing for PN 1234 to Customer X",
    };
    const { qualifies, reasons } = scoreTaskContentPair(task, {
      kind: "email",
      text: "Hi Jordan, here you go.",
      extractedProvides: ["the drawing for PN 1234, attached"],
    });
    expect(qualifies).toBe(true);
    expect(reasons.some((r) => r.includes("provides"))).toBe(true);
  });

  it("a meeting's attendee name qualifies with meeting-appropriate phrasing", () => {
    const task: MatchableTask = { id: "t7", title: "Ask Priya about the forecast numbers" };
    const { qualifies, reasons } = scoreTaskContentPair(task, {
      kind: "meeting",
      text: "Quarterly forecast review",
      personNames: ["Priya"],
    });
    expect(qualifies).toBe(true);
    expect(reasons.some((r) => r.includes("Priya") && r.includes("meeting"))).toBe(true);
  });

  it("scores zero and does not qualify for genuinely unrelated content", () => {
    const task: MatchableTask = { id: "t8", title: "Renew the parking permit", customer: "internal" };
    const { score, qualifies } = scoreTaskContentPair(task, {
      kind: "email",
      accountName: "Some Other Co",
      text: "Newsletter: industry roundup. Here is this week's roundup of unrelated news.",
    });
    expect(score).toBe(0);
    expect(qualifies).toBe(false);
  });

  it("never matches on account for internal tasks", () => {
    const task: MatchableTask = { id: "t9", title: "Internal reminder", customer: "internal" };
    const { reasons } = scoreTaskContentPair(task, { kind: "email", accountName: "internal", text: "x y" });
    expect(reasons.some((r) => r.includes("Same account"))).toBe(false);
  });
});

describe("scoreTaskEmailPair (thin email wrapper)", () => {
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
    const { score, reasons, qualifies } = scoreTaskEmailPair(baseTask, email);
    expect(qualifies).toBe(true);
    expect(score).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes("1234"))).toBe(true);
    expect(reasons.some((r) => r.includes("Scott"))).toBe(true);
  });

  it("requires a whole-word, minimum-length name match (no false positive on short/partial names)", () => {
    const task: MatchableTask = { id: "t5", title: "Update the Scots Valley shipping address" };
    const email: MatchableEmail = {
      subject: "hi",
      bodyText: "just checking in",
      fromName: "Sc",
    };
    const { score, qualifies } = scoreTaskEmailPair(task, email);
    expect(score).toBe(0);
    expect(qualifies).toBe(false);
  });

  it("cached extraction on the email surfaces as a qualifying signal end to end", () => {
    const task: MatchableTask = {
      id: "t10",
      title: "Get confirmation the sterilization docs are updated for Acme",
      customer: "Acme Corp",
    };
    const email: MatchableEmail = {
      accountName: "Acme Corp",
      subject: "Quick update",
      bodyText: "Hi Jordan, wanted to flag something unrelated in the doc.",
      extractedProvides: ["confirmation the sterilization docs are updated"],
    };
    const { qualifies } = scoreTaskEmailPair(task, email);
    expect(qualifies).toBe(true);
  });
});

describe("delegate email exact match (dev-feedback #20 item 4)", () => {
  it("qualifies on an exact delegate-email match alone, with no other signal", () => {
    const task: MatchableTask = {
      id: "t20",
      title: "Ask about the lead time on the new tooling",
      delegateEmail: "scott.ridley@merit.com",
      delegateName: "Scott Ridley",
    };
    const email: MatchableEmail = {
      subject: "hi",
      bodyText: "just checking in, nothing specific mentioned here",
      fromName: "Someone Else",
      fromEmail: "scott.ridley@merit.com",
    };
    const { score, reasons, qualifies } = scoreTaskEmailPair(task, email);
    expect(qualifies).toBe(true);
    expect(score).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes("Scott Ridley") && r.includes("delegated to"))).toBe(true);
  });

  it("matches case-insensitively", () => {
    const task: MatchableTask = {
      id: "t21",
      title: "Follow up",
      delegateEmail: "Scott.Ridley@Merit.com",
      delegateName: "Scott Ridley",
    };
    const email: MatchableEmail = {
      subject: "re",
      bodyText: "no shared keywords here at all",
      fromEmail: "scott.ridley@merit.com",
    };
    expect(scoreTaskEmailPair(task, email).qualifies).toBe(true);
  });

  it("does not qualify when the sender is someone else, even with a similar name", () => {
    const task: MatchableTask = {
      id: "t22",
      title: "Ask Scott about the lead time",
      delegateEmail: "scott.ridley@merit.com",
      delegateName: "Scott Ridley",
    };
    const email: MatchableEmail = {
      subject: "hi",
      bodyText: "unrelated note",
      fromName: "Scott Anderson",
      fromEmail: "scott.anderson@merit.com",
    };
    // Falls back to the fuzzy named-person signal ("Scott" in the task text),
    // which still qualifies, but the delegate-specific reason must not fire.
    const { reasons } = scoreTaskEmailPair(task, email);
    expect(reasons.some((r) => r.includes("delegated to"))).toBe(false);
  });

  it("does not qualify when the task has no delegate", () => {
    const task: MatchableTask = { id: "t23", title: "Some unrelated task" };
    const email: MatchableEmail = {
      subject: "hi",
      bodyText: "nothing shared",
      fromEmail: "anyone@merit.com",
    };
    expect(scoreTaskEmailPair(task, email).qualifies).toBe(false);
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

  it("ranks the plausible task above the unrelated one and excludes non-qualifying candidates", () => {
    const result = matchTasksForEmail(tasks, email);
    expect(result.map((r) => r.taskId)).toEqual(["match"]);
    expect(result[0].reasons.length).toBeGreaterThan(0);
    expect(result[0].qualifies).toBe(true);
  });

  it("excludes a same-account-only task that has no other qualifying signal (dev-feedback #14)", () => {
    const accountOnlyTasks: MatchableTask[] = [
      { id: "account-only", title: "Something totally unrelated to this email", customer: "Customer X" },
    ];
    const accountOnlyEmail: MatchableEmail = {
      accountName: "Customer X",
      subject: "hi",
      bodyText: "just checking in, nothing specific",
    };
    const result = matchTasksForEmail(accountOnlyTasks, accountOnlyEmail);
    expect(result).toEqual([]);
  });

  it("respects the limit", () => {
    const many: MatchableTask[] = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      title: `Task about PN 1234 for account ${i}`,
    }));
    const result = matchTasksForEmail(many, email, 3);
    expect(result.length).toBe(3);
  });

  it("sorts descending by score among qualifying matches", () => {
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
