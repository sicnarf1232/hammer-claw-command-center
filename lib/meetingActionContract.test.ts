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
    expect(jordan.provenance).toBe(MODEL);
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

  it("carries separate owner and account review states; accounts always unassigned", () => {
    const byText = new Map(actions.map((a) => [a.text, a]));
    // A team/function owner is a state we already know, not a person guess.
    expect(byText.get("Pull the affected lot travelers.")?.ownerReviewState).toBe("group");
    // Jordan (me), Amy (customer), Scott (unknown): owners all left unresolved.
    expect(byText.get("Send the updated Q3 forecast.")?.ownerReviewState).toBe("unassigned");
    expect(byText.get("Confirm the revised GTIN list.")?.ownerReviewState).toBe("unassigned");
    expect(byText.get("Review the complaint history.")?.ownerReviewState).toBe("unassigned");
    // Account review is a separate axis, unresolved for every action in Slice B.
    for (const a of actions) expect(a.accountReviewState).toBe("unassigned");
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

// Finding 2: the real refresh boundary. A refresh re-triages from Granola and
// rebuilds the contract; because the id is derived from text, changed wording
// would mint a different id unless the prior id is carried. These tests build
// the prior contract with the REAL builder, then refresh with changed wording,
// so the carried id is derived from the prior payload, not hand-inserted.
describe("refreshActionProposals: identity survives re-triage with changed wording", () => {
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

  it("a single reworded action carries its id by deterministic elimination", () => {
    // Two of three unchanged (match by fingerprint); the third is reworded, so
    // exactly one prior and one new remain unmatched => same action, id carried.
    const reworded: TriagedActionItem[] = [
      first[0],
      first[1],
      { owner: "Jordan", text: "Close out the open CAPA with the Quality team.", isJordans: true, ownerClass: "me" },
    ];
    const refreshed = refreshActionProposals(prior, reworded, GRANOLA, MODEL);
    // Identity carried from the PRIOR payload (not inserted into the input):
    expect(refreshed[2].actionId).toBe(prior[2].actionId);
    // Editable text follows the new wording; the original extraction is preserved.
    expect(refreshed[2].text).toBe("Close out the open CAPA with the Quality team.");
    expect(refreshed[2].originalText).toBe("Chase the open CAPA with Quality.");
    expect(refreshed[2].sourceRef).toBe(prior[2].sourceRef);
    // Fingerprint reflects the current wording, so it differs from the original.
    expect(refreshed[2].fingerprint).not.toBe(prior[2].fingerprint);
  });

  it("reordering across a refresh keeps every id attached to its action", () => {
    const reordered: TriagedActionItem[] = [first[2], first[0], first[1]];
    const refreshed = refreshActionProposals(prior, reordered, GRANOLA, MODEL);
    expect(refreshed[0].actionId).toBe(prior[2].actionId);
    expect(refreshed[1].actionId).toBe(prior[0].actionId);
    expect(refreshed[2].actionId).toBe(prior[1].actionId);
  });

  it("ambiguous multi-rewording stays unresolved: fresh ids, not positional guesses", () => {
    // Two actions BOTH reworded at once (only the first stays unchanged). Two
    // priors and two new remain unmatched after fingerprinting; elimination is
    // ambiguous, so the reworded actions get fresh ids rather than a guess.
    const twoReworded: TriagedActionItem[] = [
      first[0],
      { owner: "Amy", text: "Verify the corrected GTIN spreadsheet.", isJordans: false, ownerClass: "customer" },
      { owner: "Jordan", text: "Escalate the CAPA to management.", isJordans: true, ownerClass: "me" },
    ];
    const refreshed = refreshActionProposals(prior, twoReworded, GRANOLA, MODEL);
    expect(refreshed[0].actionId).toBe(prior[0].actionId); // unchanged, carried
    // The two reworded actions did NOT inherit prior[1]/prior[2] ids.
    const priorIds = new Set(prior.map((a) => a.actionId));
    expect(priorIds.has(refreshed[1].actionId)).toBe(false);
    expect(priorIds.has(refreshed[2].actionId)).toBe(false);
    expect(refreshed[1].actionId).not.toBe(refreshed[2].actionId);
  });

  it("meetingActionContract routes to the refresh path when prior actions are supplied", () => {
    const reworded: TriagedActionItem[] = [
      first[0],
      first[1],
      { owner: "Jordan", text: "Close the CAPA fully.", isJordans: true, ownerClass: "me" },
    ];
    const { contractVersion, actions } = meetingActionContract(
      GRANOLA,
      reworded,
      MODEL,
      prior,
    );
    expect(contractVersion).toBe(MEETING_ACTION_CONTRACT_VERSION);
    expect(actions[2].actionId).toBe(prior[2].actionId); // carried through the wrapper
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
