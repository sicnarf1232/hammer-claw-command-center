import { describe, it, expect } from "vitest";
import { parseMeetingNote } from "./vault/meetings";
import {
  reconcileActionsByLine,
  rowsAfterFirstSave,
  reconcileActionsById,
  idRowsAfterFirstSave,
  type ReconcileAction,
  type IdentifiedAction,
} from "./meetingActionReconcile";
import { mintActionIdsForNote } from "./meetingActionIdentity";
import {
  NOTE_BASELINE,
  NOTE_REORDERED,
  NOTE_EDITED,
  NOTE_REMOVED,
  NOTE_SPLIT,
  NOTE_MERGED,
  NOTE_GRANOLA_FIRST_PULL,
  NOTE_GRANOLA_SECOND_PULL,
} from "./__fixtures__/meetingActions";

// Slice A characterization of the CURRENT meeting-action -> task reconciliation
// in `dbSaveMeetingContent()` (lib/meetingsDb.ts:218-249). These tests pin what
// the system does today, including where it is WRONG, so Slice D can change it
// deliberately. Each scenario notes the desired stable-id behavior from
// docs/decisions/meeting-linking-rules.md ("Editing behavior").
//
// The parser is the real `parseMeetingNote`, so `sourceLine` values are exactly
// what production assigns. The first save is modeled as one task row per action
// (rowsAfterFirstSave); the second pull is reconciled against those rows.

const actionsOf = (md: string): ReconcileAction[] =>
  parseMeetingNote(md, "meeting.md").actionItems.map((a) => ({
    sourceLine: a.sourceLine,
    text: a.text,
  }));

describe("reconcileActionsByLine: identity is the Markdown line number", () => {
  it("reprocessing the identical note is idempotent (all update, no inserts, no strands)", () => {
    const first = actionsOf(NOTE_GRANOLA_FIRST_PULL);
    const rows = rowsAfterFirstSave(first);
    const result = reconcileActionsByLine(actionsOf(NOTE_GRANOLA_SECOND_PULL), rows);
    expect(result.inserts).toEqual([]);
    expect(result.stranded).toEqual([]);
    expect(result.updates.map((u) => u.id)).toEqual([1, 2, 3]);
  });

  it("edit-in-place on a line keeps that row's id but is line-based, not text-based", () => {
    const rows = rowsAfterFirstSave(actionsOf(NOTE_BASELINE));
    const result = reconcileActionsByLine(actionsOf(NOTE_EDITED), rows);
    // The reworded action stayed on its line, so its task id survives and the
    // new wording is written. This only works because the LINE did not move.
    const gtin = result.updates.find((u) => u.sourceLine === 10);
    expect(gtin?.id).toBe(2);
    expect(gtin?.text).toBe("Confirm the revised GTIN list by Friday.");
    expect(result.inserts).toEqual([]);
    expect(result.stranded).toEqual([]);
  });

  it("REORDER silently corrupts identity: task #1 is overwritten with a different action's text", () => {
    // KNOWN BUG. Reordering keeps every line index occupied, so every row is
    // "updated" and nothing looks wrong, but each id now points at whatever
    // action landed on its old line. Task #1 was "Send the updated Q3 forecast."
    // and is now the CAPA action.
    const rows = rowsAfterFirstSave(actionsOf(NOTE_BASELINE));
    const result = reconcileActionsByLine(actionsOf(NOTE_REORDERED), rows);
    expect(result.inserts).toEqual([]);
    expect(result.stranded).toEqual([]);
    const task1 = result.updates.find((u) => u.id === 1);
    expect(task1?.text).toBe("Chase the open CAPA with Quality.");
    // TODO Slice D: reorder must preserve each action's id and links, so task #1
    // should still read "Send the updated Q3 forecast." (linking-rules: Reorder
    // preserves action ID and links).
  });

  it("REMOVAL leaves a stale live task: the deleted action's row is repurposed and a valid row strands", () => {
    // KNOWN BUG. Deleting the middle action shifts the survivors up a line. The
    // writer never deletes (meetingsDb.ts:208-210), so the last existing row
    // (#3) is neither updated nor archived and remains an active task, while #2
    // (originally the now-deleted "Confirm" action) is silently reused.
    const rows = rowsAfterFirstSave(actionsOf(NOTE_BASELINE));
    const result = reconcileActionsByLine(actionsOf(NOTE_REMOVED), rows);
    expect(result.stranded).toEqual([{ id: 3, sourceLine: 11 }]);
    expect(result.inserts).toEqual([]);
    // TODO Slice D: removal must archive/cancel the removed action's linked task
    // and must not leave a stale active task (linking-rules: Remove after
    // approval archives/cancels; it must not silently leave a stale active task).
  });

  it("SPLIT has no supersession: the source row is kept and only the extra line inserts", () => {
    // KNOWN GAP. Splitting one action into two appends a line. The original
    // source line is updated in place and the new line inserts; there is no
    // record that one action became two.
    const rows = rowsAfterFirstSave(actionsOf(NOTE_BASELINE));
    const result = reconcileActionsByLine(actionsOf(NOTE_SPLIT), rows);
    expect(result.updates.map((u) => u.id)).toEqual([1, 2, 3]);
    expect(result.inserts).toEqual([
      { sourceLine: 12, text: "Draft the CAPA closure memo." },
    ]);
    expect(result.stranded).toEqual([]);
    // TODO Slice D: split must supersede the original action with two or more
    // new action IDs (linking-rules: Split supersedes the original).
  });

  it("MERGE has no supersession: one source row strands instead of being superseded", () => {
    // KNOWN GAP. Merging two actions into one removes a line, so the last row
    // strands (never archived) rather than being recorded as superseded by the
    // merged action.
    const rows = rowsAfterFirstSave(actionsOf(NOTE_BASELINE));
    const result = reconcileActionsByLine(actionsOf(NOTE_MERGED), rows);
    expect(result.stranded).toEqual([{ id: 3, sourceLine: 11 }]);
    expect(result.inserts).toEqual([]);
    // TODO Slice D: merge must supersede the source actions with one new action
    // ID (linking-rules: Merge supersedes the sources into one new ID).
  });

  // Desired end-state behaviors that Slice A cannot yet satisfy (there is no
  // stable action id to key on). Left as pending specs for Slice D.
  it.todo(
    "Slice D: reorder preserves task identity when actions carry a stable action id",
  );
  it.todo(
    "Slice D: removal archives the linked task instead of stranding a live row",
  );
  it.todo(
    "Slice D: split and merge record explicit supersession of the source actions",
  );
});

describe("reconcileActionsByLine: edge cases in the line-keyed match", () => {
  it("inserts every action when there are no existing rows", () => {
    const actions = actionsOf(NOTE_BASELINE);
    const result = reconcileActionsByLine(actions, []);
    expect(result.updates).toEqual([]);
    expect(result.inserts).toEqual(actions);
    expect(result.stranded).toEqual([]);
  });

  it("strands a row shadowed by a duplicate source line (Map-last-wins), mirroring the writer", () => {
    // Two existing rows claim line 9; the Map keeps the last (#2), so an action
    // on line 9 updates #2 and #1 strands. This mirrors `new Map(...)` in
    // meetingsDb.ts:223.
    const result = reconcileActionsByLine(
      [{ sourceLine: 9, text: "only action" }],
      [
        { id: 1, sourceLine: 9 },
        { id: 2, sourceLine: 9 },
      ],
    );
    expect(result.updates).toEqual([{ id: 2, sourceLine: 9, text: "only action" }]);
    expect(result.stranded).toEqual([{ id: 1, sourceLine: 9 }]);
  });
});

// Slice B: the target-state reconcile keyed on the stable action id. Same three
// scenarios the line-based model corrupts above (reorder, edit, removal), now
// resolved. Identity is CARRIED on each action (minted once, then preserved
// through review/edit), never recomputed from text or line, so these tests build
// the second-pull action lists by keeping the baseline ids.
describe("reconcileActionsById: stable identity survives reorder and edit", () => {
  const GRANOLA = "granola-xyz";
  const BASELINE_TEXT = [
    "Send the updated Q3 forecast.",
    "Confirm the revised GTIN list.",
    "Chase the open CAPA with Quality.",
  ];
  // Mint ids once for the baseline; these ids are what every later pull carries.
  const minted = mintActionIdsForNote(GRANOLA, BASELINE_TEXT);
  const baseline: IdentifiedAction[] = BASELINE_TEXT.map((text, i) => ({
    actionId: minted[i].actionId,
    text,
  }));
  const rows = idRowsAfterFirstSave(baseline); // ids -> task rows 1,2,3

  it("REORDER: all updates, no inserts, no removed, ids stable", () => {
    const reordered: IdentifiedAction[] = [baseline[2], baseline[0], baseline[1]];
    const result = reconcileActionsById(reordered, rows);
    expect(result.inserts).toEqual([]);
    expect(result.removed).toEqual([]);
    // Each id still maps to its original task row and its original text, unlike
    // the line-based model where task #1 was overwritten with the CAPA action.
    const byId = new Map(result.updates.map((u) => [u.actionId, u]));
    expect(byId.get(baseline[0].actionId)?.id).toBe(1);
    expect(byId.get(baseline[0].actionId)?.text).toBe(
      "Send the updated Q3 forecast.",
    );
    expect(byId.get(baseline[2].actionId)?.id).toBe(3);
  });

  it("EDIT-IN-PLACE: id is carried, new wording written, no insert or removal", () => {
    const edited: IdentifiedAction[] = [
      baseline[0],
      { actionId: baseline[1].actionId, text: "Confirm the revised GTIN list by Friday." },
      baseline[2],
    ];
    const result = reconcileActionsById(edited, rows);
    expect(result.inserts).toEqual([]);
    expect(result.removed).toEqual([]);
    const gtin = result.updates.find((u) => u.actionId === baseline[1].actionId);
    expect(gtin?.id).toBe(2);
    expect(gtin?.text).toBe("Confirm the revised GTIN list by Friday.");
  });

  it("REMOVAL: the removed id is precisely identified (archivable), nothing strands blindly", () => {
    const removedMiddle: IdentifiedAction[] = [baseline[0], baseline[2]];
    const result = reconcileActionsById(removedMiddle, rows);
    expect(result.inserts).toEqual([]);
    // Exactly the deleted action's row surfaces, keyed by its stable id, so
    // Slice D can archive/supersede it instead of leaving a stale live task.
    expect(result.removed).toEqual([{ id: 2, actionId: baseline[1].actionId }]);
    expect(result.updates.map((u) => u.id).sort()).toEqual([1, 3]);
  });

  it("INSERT: a genuinely new action (new id) inserts without disturbing the rest", () => {
    const added = mintActionIdsForNote(GRANOLA, ["Draft the CAPA closure memo."])[0];
    const withNew: IdentifiedAction[] = [
      ...baseline,
      { actionId: added.actionId, text: "Draft the CAPA closure memo." },
    ];
    const result = reconcileActionsById(withNew, rows);
    expect(result.removed).toEqual([]);
    expect(result.updates.map((u) => u.id)).toEqual([1, 2, 3]);
    expect(result.inserts).toEqual([
      { actionId: added.actionId, text: "Draft the CAPA closure memo." },
    ]);
  });
});

describe("dbSaveMeetingContent provenance gaps (documentation-only)", () => {
  // This is a pure/logic assertion, not a DB test. It records, with a citation,
  // three facts about the production writer verified by reading the source on
  // 2026-07-22. See docs/plans/meeting-intelligence-cleanup.md gaps 1 and 2.
  it("the reconcile model carries no ownerPersonId, matching the writer's payload", () => {
    // lib/meetingsDb.ts:225-233 builds `base` from text/done/due/isJordans/
    // meetingId/accountId only. There is no ownerPersonId in the insert
    // (lib/meetingsDb.ts:238-247) or the update (lib/meetingsDb.ts:236), so an
    // extracted owner name is never persisted as tasks.owner_person_id.
    const rows = rowsAfterFirstSave(actionsOf(NOTE_BASELINE));
    const result = reconcileActionsByLine(actionsOf(NOTE_EDITED), rows);
    for (const update of result.updates) {
      expect(update).not.toHaveProperty("ownerPersonId");
    }
    for (const insert of result.inserts) {
      expect(insert).not.toHaveProperty("ownerPersonId");
    }
  });

  it("existing task rows are keyed by sourceLine and disappeared rows are never reconciled", () => {
    // lib/meetingsDb.ts:223 keys existing rows by sourceLine; the loop only
    // updates rows it hits by line and never archives a miss (the writer
    // "Never deletes", meetingsDb.ts:208-210). A disappeared action's row
    // therefore surfaces here as `stranded` with no archival step.
    const rows = rowsAfterFirstSave(actionsOf(NOTE_BASELINE));
    const result = reconcileActionsByLine(actionsOf(NOTE_MERGED), rows);
    expect(result.stranded.length).toBeGreaterThan(0);
  });
});
