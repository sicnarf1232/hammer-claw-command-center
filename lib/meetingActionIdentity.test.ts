import { describe, it, expect } from "vitest";
import {
  ACTION_ID_PREFIX,
  normalizeActionText,
  actionFingerprint,
  mintActionId,
  mintActionIdsForNote,
} from "./meetingActionIdentity";

// Slice B: the stable action id must be independent of Markdown line position
// (so reorder is a non-event) and deterministic per extraction (so re-pulling
// an unedited note is idempotent). See docs/decisions/meeting-linking-rules.md
// "Stable action identity" and docs/plans/SLICE-B-stable-identity-plan.md.

const GRANOLA = "granola-abc-123";
const BASELINE = [
  "Send the updated Q3 forecast.",
  "Confirm the revised GTIN list.",
  "Chase the open CAPA with Quality.",
];

describe("normalizeActionText / actionFingerprint", () => {
  it("collapses whitespace, lowercases, and drops trailing punctuation", () => {
    expect(normalizeActionText("  Send   the  Forecast.  ")).toBe(
      "send the forecast",
    );
  });

  it("gives the same fingerprint for cosmetically different but equal text", () => {
    expect(actionFingerprint("Send the forecast")).toBe(
      actionFingerprint("  send the   forecast.  "),
    );
  });

  it("gives different fingerprints when the wording actually changes", () => {
    expect(actionFingerprint("Send the forecast")).not.toBe(
      actionFingerprint("Send the revised forecast"),
    );
  });
});

describe("mintActionId", () => {
  it("is deterministic and prefixed", () => {
    const a = mintActionId(GRANOLA, actionFingerprint(BASELINE[0]));
    const b = mintActionId(GRANOLA, actionFingerprint(BASELINE[0]));
    expect(a).toBe(b);
    expect(a.startsWith(ACTION_ID_PREFIX)).toBe(true);
    expect(a).toMatch(/^act_[0-9a-z]{22}$/);
  });

  it("differs across granola notes for identical text", () => {
    const fp = actionFingerprint(BASELINE[0]);
    expect(mintActionId("note-1", fp)).not.toBe(mintActionId("note-2", fp));
  });

  it("differs across dup indexes for identical text within one note", () => {
    const fp = actionFingerprint(BASELINE[0]);
    expect(mintActionId(GRANOLA, fp, 0)).not.toBe(mintActionId(GRANOLA, fp, 1));
  });
});

describe("mintActionIdsForNote: identity survives reorder", () => {
  it("assigns the same id to the same action regardless of position", () => {
    const forward = mintActionIdsForNote(GRANOLA, BASELINE);
    const reordered = mintActionIdsForNote(GRANOLA, [
      BASELINE[2],
      BASELINE[0],
      BASELINE[1],
    ]);
    // The id follows the TEXT, not the slot: every reordered id equals the
    // original id for that same action. This is exactly what the line-based
    // model (Slice A) could not do.
    expect(reordered[0].actionId).toBe(forward[2].actionId);
    expect(reordered[1].actionId).toBe(forward[0].actionId);
    expect(reordered[2].actionId).toBe(forward[1].actionId);
  });

  it("reprocessing the identical note reproduces the identical id set", () => {
    const first = mintActionIdsForNote(GRANOLA, BASELINE).map((m) => m.actionId);
    const second = mintActionIdsForNote(GRANOLA, BASELINE).map((m) => m.actionId);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(3); // all distinct
  });

  it("disambiguates two byte-identical action lines with distinct ids", () => {
    const dup = mintActionIdsForNote(GRANOLA, [
      "Follow up with Quality.",
      "Follow up with Quality.",
    ]);
    expect(dup[0].actionId).not.toBe(dup[1].actionId);
    expect(dup[0].fingerprint).toBe(dup[1].fingerprint); // same text, same hint
  });
});
