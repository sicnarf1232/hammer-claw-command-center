import { describe, it, expect } from "vitest";
import type { TriagedActionItem } from "./ai";
import {
  buildActionProposals,
  refreshActionProposals,
  meetingActionContract,
} from "./meetingActionContract";
import { MEETING_ACTION_CONTRACT_VERSION } from "./proposals/types";
import { parseTemplatedNote, triagedFromTemplate } from "./noteTemplate";
import { NOTE_TEMPLATED_PASSTHROUGH } from "./__fixtures__/meetingActions";

// Slice B: the structured contract must come out identically whether actions
// were extracted by the AI path or the template-passthrough path (both produce
// TriagedActionItem), must record the original extraction separately from
// Jordan's editable version, and must NOT resolve any person or account.

const GRANOLA = "granola-contract-1";
const MODEL = "claude-opus-4-8";

describe("buildActionProposals: stable identity + audit + unresolved contract", () => {
  const items: TriagedActionItem[] = [
    { owner: "Jordan", text: "Send the updated Q3 forecast.", isJordans: true, ownerClass: "me", due: "2026-07-25" },
    { owner: "Amy", text: "Confirm the revised GTIN list.", isJordans: false, ownerClass: "customer", dueText: "next week" },
    { owner: "Operations", text: "Pull the affected lot travelers.", isJordans: false, ownerClass: "team" },
    { owner: "Scott", text: "Review the complaint history.", isJordans: false, ownerClass: "unknown" },
  ];

  const actions = buildActionProposals(GRANOLA, items, MODEL);

  it("mints a stable act_ id and fingerprint for every action", () => {
    expect(actions).toHaveLength(4);
    for (const a of actions) {
      expect(a.actionId).toMatch(/^act_[0-9a-z]{22}$/);
      expect(a.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    }
    expect(new Set(actions.map((a) => a.actionId)).size).toBe(4); // all distinct
  });

  it("records the original extraction separately from the editable version", () => {
    const jordan = actions[0];
    // At first extraction the editable fields equal the original, but they are
    // DISTINCT fields, and the audit fields carry provenance + a source ref.
    expect(jordan.originalText).toBe("Send the updated Q3 forecast.");
    expect(jordan.originalOwnerText).toBe("Jordan");
    expect(jordan.text).toBe(jordan.originalText);
    expect(jordan.ownerText).toBe(jordan.originalOwnerText);
    // Original and current provenance both start as the extracting model.
    expect(jordan.provenance).toBe(MODEL);
    expect(jordan.currentProvenance).toBe(MODEL);
    expect(jordan.sourceRef).toBe(`granola:${GRANOLA}#${jordan.fingerprint}`);
  });

  it("resolves NO people or accounts: candidate arrays empty, confidence none", () => {
    for (const a of actions) {
      expect(a.candidatePersonIds).toEqual([]);
      expect(a.candidateAccountIds).toEqual([]);
      expect(a.reasons).toEqual([]);
      expect(a.confidence).toBe("none");
    }
  });

  it("carries separate owner and account review states, all starting unassigned", () => {
    // The builder no longer infers `group` (Slice C: classifyOwner's "team"
    // means an internal PERSON; true team/function detection lives in the
    // deterministic resolver, which runs right after the build in the pull).
    for (const a of actions) {
      expect(a.ownerReviewState).toBe("unassigned");
      expect(a.accountReviewState).toBe("unassigned");
    }
  });

  it("defaults a missing ownerClass to unknown/unassigned rather than guessing", () => {
    const [only] = buildActionProposals(
      GRANOLA,
      [{ owner: "Pat", text: "Circulate the summary.", isJordans: false }],
      MODEL,
    );
    expect(only.ownerClass).toBe("unknown");
    expect(only.ownerReviewState).toBe("unassigned");
  });
});

describe("both extraction paths produce the same contract shape", () => {
  it("template-passthrough actions and AI-shaped actions yield identical contracts", () => {
    const templated = triagedFromTemplate(
      parseTemplatedNote(NOTE_TEMPLATED_PASSTHROUGH),
      { fallbackTitle: "t", attendees: [], knownAccounts: ["Intuitive Surgical"], date: "2026-07-20" },
    ).actionItems;

    const aiShaped: TriagedActionItem[] = [
      { owner: "Jordan", text: "Send the updated Q3 forecast.", isJordans: true, due: "2026-07-25" },
      { owner: "Amy", text: "Confirm the revised GTIN list.", isJordans: false, dueText: "next week" },
    ];

    const fromTemplate = buildActionProposals(GRANOLA, templated, "none (template pass-through)");
    const fromAi = buildActionProposals(GRANOLA, aiShaped, MODEL);

    // Same identities and same field set; raw text may differ by cosmetic
    // trailing punctuation, which is why identity is fingerprint-normalized.
    expect(fromTemplate.map((a) => a.actionId)).toEqual(fromAi.map((a) => a.actionId));
    expect(Object.keys(fromTemplate[0]).sort()).toEqual(Object.keys(fromAi[0]).sort());
    expect(fromTemplate.map((a) => a.ownerReviewState)).toEqual(
      fromAi.map((a) => a.ownerReviewState),
    );
  });
});

// Finding 2 (round 1) + Finding 1 (round 2): the real refresh boundary. A
// refresh re-triages from Granola and rebuilds the contract; because the id is
// derived from text, UNCHANGED wording must keep its id, while a rewording must
// NOT silently inherit a removed action's identity. These tests build the prior
// contract with the REAL builder, then refresh, so any carried id is derived
// from the prior payload, not hand-inserted.
describe("refreshActionProposals: identity carried only on reliable evidence", () => {
  const first: TriagedActionItem[] = [
    { owner: "Jordan", text: "Send the updated Q3 forecast.", isJordans: true, ownerClass: "me" },
    { owner: "Amy", text: "Confirm the revised GTIN list.", isJordans: false, ownerClass: "customer" },
    { owner: "Jordan", text: "Chase the open CAPA with Quality.", isJordans: true, ownerClass: "me" },
  ];
  const prior = buildActionProposals(GRANOLA, first, MODEL);

  it("unchanged actions keep their id via exact fingerprint match", () => {
    const again = refreshActionProposals(prior, first, GRANOLA, MODEL);
    expect(again.map((a) => a.actionId)).toEqual(prior.map((a) => a.actionId));
  });

  it("reordering across a refresh keeps every id attached to its action", () => {
    const reordered: TriagedActionItem[] = [first[2], first[0], first[1]];
    const refreshed = refreshActionProposals(prior, reordered, GRANOLA, MODEL);
    expect(refreshed[0].actionId).toBe(prior[2].actionId);
    expect(refreshed[1].actionId).toBe(prior[0].actionId);
    expect(refreshed[2].actionId).toBe(prior[1].actionId);
  });

  it("a reworded action does NOT carry a prior id; it becomes unresolved", () => {
    // Only the CAPA action is reworded. Its fingerprint changed, so there is no
    // reliable evidence it is the same action; it must not inherit prior[2].
    const reworded: TriagedActionItem[] = [
      first[0],
      first[1],
      { owner: "Jordan", text: "Close out the open CAPA with the Quality team.", isJordans: true, ownerClass: "me" },
    ];
    const refreshed = refreshActionProposals(prior, reworded, GRANOLA, MODEL);
    const priorIds = new Set(prior.map((a) => a.actionId));
    expect(refreshed[2].actionId).not.toBe(prior[2].actionId);
    expect(priorIds.has(refreshed[2].actionId)).toBe(false);
    // Fresh action: its own text is the original, no prior audit is borrowed.
    expect(refreshed[2].originalText).toBe("Close out the open CAPA with the Quality team.");
  });

  it("simultaneous removal + insertion: the new action never inherits the removed id", () => {
    // Prior [A, B]; refreshed [A, C]. A is unchanged (carried). B was removed and
    // C is new. Single-leftover elimination would wrongly give C the identity and
    // history of B; it must not.
    const twoPrior = buildActionProposals(
      GRANOLA,
      [
        { owner: "Jordan", text: "Send the updated Q3 forecast.", isJordans: true, ownerClass: "me" },
        { owner: "Amy", text: "Confirm the revised GTIN list.", isJordans: false, ownerClass: "customer" },
      ],
      MODEL,
    );
    const refreshed = refreshActionProposals(
      twoPrior,
      [
        { owner: "Jordan", text: "Send the updated Q3 forecast.", isJordans: true, ownerClass: "me" }, // A
        { owner: "Nick", text: "Book the supplier audit for August.", isJordans: false, ownerClass: "team" }, // C (new)
      ],
      GRANOLA,
      MODEL,
    );
    expect(refreshed[0].actionId).toBe(twoPrior[0].actionId); // A carried
    // C must be a fresh id, not the removed B's id (twoPrior[1]).
    expect(refreshed[1].actionId).not.toBe(twoPrior[1].actionId);
    expect(new Set(twoPrior.map((a) => a.actionId)).has(refreshed[1].actionId)).toBe(false);
    expect(refreshed[1].originalText).toBe("Book the supplier audit for August.");
  });

  it("keeps original provenance immutable while updating current provenance on refresh", () => {
    const MODEL_A = "claude-opus-4-8";
    const MODEL_B = "claude-sonnet-5";
    const priorA = buildActionProposals(GRANOLA, first, MODEL_A);
    const refreshed = refreshActionProposals(
      priorA,
      [
        first[0], // unchanged -> carried
        first[1], // unchanged -> carried
        { owner: "Jordan", text: "A brand new action item.", isJordans: true, ownerClass: "me" }, // new
      ],
      GRANOLA,
      MODEL_B,
    );
    // Carried action: original provenance preserved, current provenance updated.
    expect(refreshed[0].provenance).toBe(MODEL_A);
    expect(refreshed[0].currentProvenance).toBe(MODEL_B);
    // Genuinely new action: both provenances are the current model.
    expect(refreshed[2].provenance).toBe(MODEL_B);
    expect(refreshed[2].currentProvenance).toBe(MODEL_B);
  });

  it("meetingActionContract routes to the refresh path (carried original provenance proves it)", () => {
    const MODEL_B = "claude-sonnet-5";
    const { contractVersion, actions } = meetingActionContract(
      GRANOLA,
      first, // unchanged actions
      MODEL_B,
      prior, // prior built with MODEL
    );
    expect(contractVersion).toBe(MEETING_ACTION_CONTRACT_VERSION);
    // A fresh build with MODEL_B would set provenance=MODEL_B; the refresh path
    // preserves the ORIGINAL provenance, so this proves routing to the refresh.
    expect(actions[0].actionId).toBe(prior[0].actionId);
    expect(actions[0].provenance).toBe(MODEL); // original, carried
    expect(actions[0].currentProvenance).toBe(MODEL_B); // this refresh
  });
});

describe("meetingActionContract wrapper (initial build)", () => {
  it("stamps the contract version alongside freshly built actions", () => {
    const { contractVersion, actions } = meetingActionContract(
      GRANOLA,
      [{ owner: "Jordan", text: "Do the thing.", isJordans: true }],
      MODEL,
    );
    expect(contractVersion).toBe(MEETING_ACTION_CONTRACT_VERSION);
    expect(actions).toHaveLength(1);
    expect(actions[0].provenance).toBe(MODEL);
  });
});
