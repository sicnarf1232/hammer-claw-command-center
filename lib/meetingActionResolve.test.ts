import { describe, it, expect } from "vitest";
import {
  resolveOwner,
  resolveActionOwners,
  isTeamOwner,
  type ResolvePerson,
} from "./meetingActionResolve";
import { buildActionProposals } from "./meetingActionContract";

// Slice C: deterministic owner resolution per the matching order in
// docs/decisions/meeting-linking-rules.md. The resolver only suggests; it never
// emits `assigned` and never guesses between plausible people.

const P = (
  id: number,
  fullName: string,
  over: Partial<ResolvePerson> = {},
): ResolvePerson => ({
  id,
  fullName,
  classification: "internal",
  accountId: null,
  email: null,
  aliases: [],
  isSelf: false,
  ...over,
});

const JORDAN = P(1, "Jordan Francis", { isSelf: true });
const SCOTT_REYES = P(2, "Scott Reyes");
const SCOTT_PALMER = P(3, "Scott Palmer", { classification: "customer", accountId: 10 });
const AMY = P(4, "Amy Lee", {
  classification: "customer",
  accountId: 10,
  email: "amy.lee@intuitive.com",
});
const NICK = P(5, "Nick Patel", { aliases: ["Nicky"] });

const CTX = {
  people: [JORDAN, SCOTT_REYES, SCOTT_PALMER, AMY, NICK],
  attendees: ["Jordan Francis", "Amy Lee"],
};

describe("resolveOwner: matching order", () => {
  it("two active Scotts: first-name owner is AMBIGUOUS with both candidates, no guess", () => {
    const r = resolveOwner("Scott", false, CTX);
    expect(r.ownerReviewState).toBe("ambiguous");
    expect(r.candidatePersonIds.sort()).toEqual([2, 3]);
    expect(r.confidence).toBe("low");
  });

  it("exact full name with a single active match is suggested (high)", () => {
    const r = resolveOwner("Scott Reyes", false, CTX);
    expect(r.ownerReviewState).toBe("suggested");
    expect(r.candidatePersonIds).toEqual([2]);
    expect(r.confidence).toBe("high");
  });

  it("confirmed alias matches (Nicky -> Nick Patel)", () => {
    const r = resolveOwner("Nicky", false, CTX);
    expect(r.ownerReviewState).toBe("suggested");
    expect(r.candidatePersonIds).toEqual([5]);
    expect(r.reasons.join(" ")).toMatch(/alias/i);
  });

  it("exact email address matches", () => {
    const r = resolveOwner("amy.lee@intuitive.com", false, CTX);
    expect(r.ownerReviewState).toBe("suggested");
    expect(r.candidatePersonIds).toEqual([4]);
  });

  it("first name disambiguated by attendance (Amy attended, only one Amy)", () => {
    const r = resolveOwner("Amy", false, CTX);
    expect(r.ownerReviewState).toBe("suggested");
    expect(r.candidatePersonIds).toEqual([4]);
    expect(r.confidence).toBe("medium");
    expect(r.reasons.join(" ")).toMatch(/attendee/i);
  });

  it("a team/function owner is `group`, never a person candidate", () => {
    expect(isTeamOwner("Operations")).toBe(true);
    const r = resolveOwner("Operations", false, CTX);
    expect(r.ownerReviewState).toBe("group");
    expect(r.candidatePersonIds).toEqual([]);
  });

  it("an internal colleague is a person suggestion, NOT group (classifyOwner 'team' fix)", () => {
    const r = resolveOwner("Nick Patel", false, CTX);
    expect(r.ownerReviewState).toBe("suggested");
    expect(r.candidatePersonIds).toEqual([5]);
  });

  it("Jordan's own action suggests the self person (still not auto-assigned)", () => {
    const r = resolveOwner("Jordan", true, CTX);
    expect(r.ownerReviewState).toBe("suggested");
    expect(r.candidatePersonIds).toEqual([1]);
    expect(r.confidence).toBe("high");
  });

  it("an unknown owner stays unassigned with no candidates", () => {
    const r = resolveOwner("Priya Vendor", false, CTX);
    expect(r.ownerReviewState).toBe("unassigned");
    expect(r.candidatePersonIds).toEqual([]);
    expect(r.confidence).toBe("none");
  });

  it("no owner text stays unassigned", () => {
    const r = resolveOwner(null, false, CTX);
    expect(r.ownerReviewState).toBe("unassigned");
  });

  it("a name that is one person's alias AND another's full name is ambiguous", () => {
    const ctx = {
      people: [P(7, "Sam Ortiz", { aliases: ["Alex"] }), P(8, "Alex")],
      attendees: [],
    };
    const r = resolveOwner("Alex", false, ctx);
    expect(r.ownerReviewState).toBe("ambiguous");
    expect(r.candidatePersonIds.sort()).toEqual([7, 8]);
  });
});

describe("resolveActionOwners over a real contract", () => {
  it("resolves suggestions in place and leaves assigned/rejected actions untouched", () => {
    const built = buildActionProposals(
      "granola-resolve-1",
      [
        { owner: "Jordan", text: "Send the forecast.", isJordans: true },
        { owner: "Scott", text: "Review the complaint history.", isJordans: false },
        { owner: "Operations", text: "Pull the travelers.", isJordans: false },
      ],
      "claude-opus-4-8",
    );
    // Simulate one action Jordan already confirmed before a re-resolve.
    built[0] = {
      ...built[0],
      ownerReviewState: "assigned",
      confirmedPersonId: 99,
      candidatePersonIds: [1],
    };

    const resolved = resolveActionOwners(built, CTX);
    // Assigned action untouched, confirmation intact.
    expect(resolved[0].ownerReviewState).toBe("assigned");
    expect(resolved[0].confirmedPersonId).toBe(99);
    // Ambiguous Scott surfaces both candidates.
    expect(resolved[1].ownerReviewState).toBe("ambiguous");
    expect(resolved[1].candidatePersonIds.sort()).toEqual([2, 3]);
    // Function owner becomes group.
    expect(resolved[2].ownerReviewState).toBe("group");
  });
});
