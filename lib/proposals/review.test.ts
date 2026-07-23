import { describe, it, expect } from "vitest";
import {
  applyActionReviews,
  collectAssignedPersonIds,
  missingPersonIds,
} from "./review";
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

  it("nonexistent person id is reported missing (server rejects the update)", () => {
    const collected = collectAssignedPersonIds([
      { actionId: "act_a", state: "assigned", personId: 999 },
    ]);
    expect(collected.ok).toBe(true);
    if (collected.ok) {
      expect(missingPersonIds(collected.ids, new Set([1, 2, 3]))).toEqual([999]);
    }
  });

  it("a superseded person id is missing from the ACTIVE set and rejects", () => {
    // The active set is built with `superseded_by IS NULL`; person 2 was
    // superseded, so it is absent even though the row exists.
    const activeIds = new Set([1, 3]);
    expect(missingPersonIds([2], activeIds)).toEqual([2]);
  });

  it("decimal, negative, zero, and missing person ids fail collection", () => {
    for (const personId of [7.5, -1, 0, undefined, null] as const) {
      const res = collectAssignedPersonIds([
        { actionId: "act_a", state: "assigned", personId: personId as number | null | undefined },
      ]);
      expect(res.ok).toBe(false);
    }
  });

  it("a valid ACTIVE person outside the candidate list passes (Everyone picks allowed)", () => {
    const collected = collectAssignedPersonIds([
      { actionId: "act_a", state: "assigned", personId: 42 },
    ]);
    expect(collected.ok).toBe(true);
    if (collected.ok) {
      // 42 is active; it was never in any candidate list, and that is fine.
      expect(missingPersonIds(collected.ids, new Set([7, 42]))).toEqual([]);
    }
  });

  it("non-assigned states collect no ids and cannot fail on personId", () => {
    const res = collectAssignedPersonIds([
      { actionId: "act_a", state: "rejected" },
      { actionId: "act_b", state: "unassigned" },
      { actionId: "act_c", state: "group" },
    ]);
    expect(res).toEqual({ ok: true, ids: [] });
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
