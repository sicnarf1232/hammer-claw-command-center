import { describe, it, expect } from "vitest";
import type { TriagedActionItem } from "./ai";
import { buildActionProposals, meetingActionContract } from "./meetingActionContract";
import { MEETING_ACTION_CONTRACT_VERSION } from "./proposals/types";
import { parseTemplatedNote, triagedFromTemplate } from "./noteTemplate";
import { NOTE_TEMPLATED_PASSTHROUGH } from "./__fixtures__/meetingActions";

// Slice B: the structured contract must come out identically whether actions
// were extracted by the AI path or the template-passthrough path (both produce
// TriagedActionItem), and it must NOT resolve any person or account. Candidate
// arrays stay empty and no individual owner is promoted past `unassigned`.

const GRANOLA = "granola-contract-1";

describe("buildActionProposals: stable identity + unresolved contract", () => {
  const items: TriagedActionItem[] = [
    { owner: "Jordan", text: "Send the updated Q3 forecast.", isJordans: true, ownerClass: "me", due: "2026-07-25" },
    { owner: "Amy", text: "Confirm the revised GTIN list.", isJordans: false, ownerClass: "customer", dueText: "next week" },
    { owner: "Operations", text: "Pull the affected lot travelers.", isJordans: false, ownerClass: "team" },
    { owner: "Scott", text: "Review the complaint history.", isJordans: false, ownerClass: "unknown" },
  ];

  const actions = buildActionProposals(GRANOLA, items);

  it("mints a stable act_ id and fingerprint for every action", () => {
    expect(actions).toHaveLength(4);
    for (const a of actions) {
      expect(a.actionId).toMatch(/^act_[0-9a-z]{22}$/);
      expect(a.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    }
    expect(new Set(actions.map((a) => a.actionId)).size).toBe(4); // all distinct
  });

  it("resolves NO people or accounts: candidate arrays are empty, confidence none", () => {
    for (const a of actions) {
      expect(a.candidatePersonIds).toEqual([]);
      expect(a.candidateAccountIds).toEqual([]);
      expect(a.reasons).toEqual([]);
      expect(a.confidence).toBe("none");
    }
  });

  it("maps only team owners to `group`; every individual owner stays `unassigned`", () => {
    const byText = new Map(actions.map((a) => [a.text, a]));
    // A team/function owner is a state we already know, not a person guess.
    expect(byText.get("Pull the affected lot travelers.")?.reviewState).toBe("group");
    // Jordan (me), Amy (customer), Scott (unknown): all left unresolved. Slice B
    // never promotes to assigned/suggested/ambiguous; the resolver does that.
    expect(byText.get("Send the updated Q3 forecast.")?.reviewState).toBe("unassigned");
    expect(byText.get("Confirm the revised GTIN list.")?.reviewState).toBe("unassigned");
    expect(byText.get("Review the complaint history.")?.reviewState).toBe("unassigned");
  });

  it("carries owner text, isJordans, and due through without inventing person ids", () => {
    const jordan = actions.find((a) => a.text === "Send the updated Q3 forecast.");
    expect(jordan?.ownerText).toBe("Jordan");
    expect(jordan?.isJordans).toBe(true);
    expect(jordan?.due).toBe("2026-07-25");
    const amy = actions.find((a) => a.text === "Confirm the revised GTIN list.");
    expect(amy?.due).toBeNull();
    expect(amy?.dueText).toBe("next week");
  });

  it("defaults a missing ownerClass to unknown/unassigned rather than guessing", () => {
    const [only] = buildActionProposals(GRANOLA, [
      { owner: "Pat", text: "Circulate the summary.", isJordans: false },
    ]);
    expect(only.ownerClass).toBe("unknown");
    expect(only.reviewState).toBe("unassigned");
  });
});

describe("both extraction paths produce the same contract shape", () => {
  it("template-passthrough actions and AI-shaped actions yield identical contracts", () => {
    // Template path: parse Jordan's templated note into TriagedActionItems.
    const templated = triagedFromTemplate(
      parseTemplatedNote(NOTE_TEMPLATED_PASSTHROUGH),
      { fallbackTitle: "t", attendees: [], knownAccounts: ["Intuitive Surgical"], date: "2026-07-20" },
    ).actionItems;

    // AI path: the same two actions as a hand-built AI result (same interface).
    const aiShaped: TriagedActionItem[] = [
      { owner: "Jordan", text: "Send the updated Q3 forecast.", isJordans: true, due: "2026-07-25" },
      { owner: "Amy", text: "Confirm the revised GTIN list.", isJordans: false, dueText: "next week" },
    ];

    const fromTemplate = buildActionProposals(GRANOLA, templated);
    const fromAi = buildActionProposals(GRANOLA, aiShaped);

    // Same identities and same field set: the contract does not depend on which
    // path extracted the actions. (Raw `text` can differ by cosmetic trailing
    // punctuation, which is why identity is fingerprint-normalized, not literal:
    // the ids still match.)
    expect(fromTemplate.map((a) => a.actionId)).toEqual(fromAi.map((a) => a.actionId));
    expect(Object.keys(fromTemplate[0]).sort()).toEqual(Object.keys(fromAi[0]).sort());
    expect(fromTemplate.map((a) => a.reviewState)).toEqual(fromAi.map((a) => a.reviewState));
  });
});

describe("meetingActionContract wrapper", () => {
  it("stamps the contract version alongside the actions", () => {
    const { contractVersion, actions } = meetingActionContract(GRANOLA, [
      { owner: "Jordan", text: "Do the thing.", isJordans: true },
    ]);
    expect(contractVersion).toBe(MEETING_ACTION_CONTRACT_VERSION);
    expect(actions).toHaveLength(1);
  });
});
