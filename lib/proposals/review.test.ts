import { describe, it, expect } from "vitest";
import { applyActionReviews } from "./review";
import { buildActionProposals } from "@/lib/meetingActionContract";

// Slice C: pure application of Jordan's review decisions onto the contract.

const NOW = () => "2026-07-23T12:00:00.000Z";

function fresh() {
  const actions = buildActionProposals(
    "granola-review-1",
    [
      { owner: "Scott", text: "Review the complaint history.", isJordans: false },
      { owner: "Amy", text: "Confirm the GTIN list.", isJordans: false },
    ],
    "claude-opus-4-8",
  );
  // Pretend the resolver suggested Amy (id 4).
  actions[1] = {
    ...actions[1],
    candidatePersonIds: [4],
    reasons: ["Full name exactly matched one person."],
    confidence: "high",
    ownerReviewState: "suggested",
  };
  return actions;
}

describe("applyActionReviews", () => {
  it("assign stores the confirmed person and reviewer, preserving the suggestion", () => {
    const out = applyActionReviews(
      fresh(),
      [{ actionId: fresh()[1].actionId, state: "assigned", personId: 4 }],
      "jordan",
      NOW,
    );
    expect(out[1].ownerReviewState).toBe("assigned");
    expect(out[1].confirmedPersonId).toBe(4);
    expect(out[1].reviewedBy).toBe("jordan");
    expect(out[1].reviewedAt).toBe(NOW());
    // Original suggestion and explanation preserved.
    expect(out[1].candidatePersonIds).toEqual([4]);
    expect(out[1].reasons).toEqual(["Full name exactly matched one person."]);
  });

  it("changing to a DIFFERENT person keeps the original suggestion intact", () => {
    const actions = fresh();
    const out = applyActionReviews(
      actions,
      [{ actionId: actions[1].actionId, state: "assigned", personId: 7 }],
      "jordan",
      NOW,
    );
    expect(out[1].confirmedPersonId).toBe(7);
    expect(out[1].candidatePersonIds).toEqual([4]); // the suggestion survives
  });

  it("reject/group/unassigned clear the confirmation but keep the audit fields", () => {
    const actions = fresh();
    const out = applyActionReviews(
      actions,
      [
        { actionId: actions[0].actionId, state: "rejected" },
        { actionId: actions[1].actionId, state: "group" },
      ],
      "jordan",
      NOW,
    );
    expect(out[0].ownerReviewState).toBe("rejected");
    expect(out[0].confirmedPersonId).toBeNull();
    expect(out[0].originalText).toBe("Review the complaint history.");
    expect(out[1].ownerReviewState).toBe("group");
  });

  it("an assignment without a personId is ignored, not fabricated", () => {
    const actions = fresh();
    const out = applyActionReviews(
      actions,
      [{ actionId: actions[0].actionId, state: "assigned" }],
      "jordan",
      NOW,
    );
    expect(out[0]).toEqual(actions[0]);
  });

  it("wording edit through review preserves the action id and the original text", () => {
    const actions = fresh();
    const out = applyActionReviews(
      actions,
      [
        {
          actionId: actions[0].actionId,
          state: "suggested",
          text: "Review the FULL complaint history.",
        },
      ],
      "jordan",
      NOW,
    );
    expect(out[0].actionId).toBe(actions[0].actionId);
    expect(out[0].text).toBe("Review the FULL complaint history.");
    expect(out[0].originalText).toBe("Review the complaint history.");
  });

  it("unknown action ids are ignored", () => {
    const actions = fresh();
    const out = applyActionReviews(
      actions,
      [{ actionId: "act_doesnotexist0000000000", state: "rejected" }],
      "jordan",
      NOW,
    );
    expect(out).toEqual(actions);
  });
});
