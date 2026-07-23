import { describe, it, expect } from "vitest";
import {
  planMeetingTaskSync,
  reconcileBlocker,
  selectReconcileTarget,
  ARCHIVED_STATUS,
  type SyncMdItem,
  type SyncTaskRow,
} from "./meetingTaskSync";
import { buildActionProposals } from "./meetingActionContract";
import { applyActionReviews } from "./proposals/review";

// Slice D acceptance, as pure tests over the planner:
//  - reorder and unchanged reprocessing preserve task identity;
//  - removal archives instead of stranding a live row;
//  - rejected actions never become tasks and archive an existing row;
//  - confirmed owners are written, suggestions are not, manual links survive;
//  - legacy rows (no action id) are adopted once, by text then line;
//  - re-running the same save is idempotent.

const NS = "granola-sync-1";

const md = (
  text: string,
  sourceLine: number,
  over: Partial<SyncMdItem> = {},
): SyncMdItem => ({
  text,
  owner: null,
  done: false,
  due: null,
  isJordans: true,
  sourceLine,
  priority: null,
  ...over,
});

const BASE_TEXTS = [
  "Send the updated Q3 forecast.",
  "Confirm the revised GTIN list.",
  "Chase the open CAPA with Quality.",
];
const BASE_MD = BASE_TEXTS.map((t, i) => md(t, 9 + i));
const CONTRACT = buildActionProposals(
  NS,
  BASE_TEXTS.map((text) => ({ owner: "Jordan", text, isJordans: true })),
  "claude-opus-4-8",
);

// Rows as they exist after a first save with the contract: one per action,
// carrying its stable id.
const rowsAfterFirstSave = (): SyncTaskRow[] =>
  CONTRACT.map((a, i) => ({
    id: i + 1,
    actionId: a.actionId,
    sourceLine: 9 + i,
    text: a.text,
    status: null,
  }));

describe("planMeetingTaskSync: identity", () => {
  it("first save inserts every action with its stable id", () => {
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: BASE_MD,
      existingRows: [],
    });
    expect(plan.updates).toEqual([]);
    expect(plan.archiveTaskIds).toEqual([]);
    expect(plan.inserts.map((i) => i.actionId)).toEqual(CONTRACT.map((a) => a.actionId));
  });

  it("re-running the identical save is idempotent: updates only, ids stable", () => {
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: BASE_MD,
      existingRows: rowsAfterFirstSave(),
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.archiveTaskIds).toEqual([]);
    expect(plan.updates.map((u) => u.taskId).sort()).toEqual([1, 2, 3]);
  });

  it("REORDER preserves every task's identity (the Slice A corruption case)", () => {
    const reordered = [md(BASE_TEXTS[2], 9), md(BASE_TEXTS[0], 10), md(BASE_TEXTS[1], 11)];
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: reordered,
      existingRows: rowsAfterFirstSave(),
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.archiveTaskIds).toEqual([]);
    const byTask = new Map(plan.updates.map((u) => [u.taskId, u.text]));
    // Task #1 still holds the forecast action, wherever its line moved.
    expect(byTask.get(1)).toBe(BASE_TEXTS[0]);
    expect(byTask.get(3)).toBe(BASE_TEXTS[2]);
  });

  it("REMOVAL archives the removed action's row instead of stranding it", () => {
    const removedMiddle = [md(BASE_TEXTS[0], 9), md(BASE_TEXTS[2], 10)];
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: removedMiddle,
      existingRows: rowsAfterFirstSave(),
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.archiveTaskIds).toEqual([2]); // exactly the removed action's row
    expect(plan.updates.map((u) => u.taskId).sort()).toEqual([1, 3]);
  });

  it("a REWORDED line becomes a new action and the old row is archived, never rewritten", () => {
    const reworded = [
      md(BASE_TEXTS[0], 9),
      md(BASE_TEXTS[1], 10),
      md("Close out the CAPA with the Quality team.", 11),
    ];
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: reworded,
      existingRows: rowsAfterFirstSave(),
    });
    expect(plan.archiveTaskIds).toEqual([3]);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].text).toBe("Close out the CAPA with the Quality team.");
    expect(plan.inserts[0].actionId).not.toBe(CONTRACT[2].actionId);
  });
});

describe("planMeetingTaskSync: review outcomes", () => {
  it("a REJECTED action never becomes a task; its existing row is archived", () => {
    const reviewed = applyActionReviews(
      CONTRACT,
      [{ actionId: CONTRACT[1].actionId, state: "rejected" }],
      "jordan",
    );
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: reviewed,
      mdItems: BASE_MD, // the note still contains the rejected line
      existingRows: rowsAfterFirstSave(),
    });
    expect(plan.archiveTaskIds).toEqual([2]);
    expect(plan.updates.map((u) => u.taskId).sort()).toEqual([1, 3]);
    expect(plan.inserts).toEqual([]);
  });

  it("a rejected action with NO existing row simply creates nothing", () => {
    const reviewed = applyActionReviews(
      CONTRACT,
      [{ actionId: CONTRACT[1].actionId, state: "rejected" }],
      "jordan",
    );
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: reviewed,
      mdItems: BASE_MD,
      existingRows: [],
    });
    expect(plan.inserts.map((i) => i.text)).toEqual([BASE_TEXTS[0], BASE_TEXTS[2]]);
  });

  it("a CONFIRMED owner is written on insert and update", () => {
    const reviewed = applyActionReviews(
      CONTRACT,
      [{ actionId: CONTRACT[0].actionId, state: "assigned", personId: 42 }],
      "jordan",
    );
    const fresh = planMeetingTaskSync({
      namespace: NS,
      contractActions: reviewed,
      mdItems: BASE_MD,
      existingRows: [],
    });
    expect(fresh.inserts[0].ownerPersonId).toBe(42);
    const again = planMeetingTaskSync({
      namespace: NS,
      contractActions: reviewed,
      mdItems: BASE_MD,
      existingRows: rowsAfterFirstSave(),
    });
    expect(again.updates.find((u) => u.taskId === 1)?.ownerPersonId).toBe(42);
  });

  it("a SUGGESTION is never persisted as an owner link", () => {
    const suggested = CONTRACT.map((a, i) =>
      i === 0
        ? { ...a, candidatePersonIds: [7], confidence: "high" as const, ownerReviewState: "suggested" as const }
        : a,
    );
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: suggested,
      mdItems: BASE_MD,
      existingRows: [],
    });
    expect(plan.inserts[0].ownerPersonId).toBeNull();
  });

  it("an unreviewed action leaves an existing manual owner link untouched; an explicit unassign clears it", () => {
    const rows = rowsAfterFirstSave();
    // Unreviewed contract: updates carry ownerPersonId undefined (preserve).
    const plain = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: BASE_MD,
      existingRows: rows,
    });
    for (const u of plain.updates) expect(u.ownerPersonId).toBeUndefined();
    // Explicit reviewed unassign: clears.
    const cleared = applyActionReviews(
      CONTRACT,
      [{ actionId: CONTRACT[0].actionId, state: "unassigned" }],
      "jordan",
    );
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: cleared,
      mdItems: BASE_MD,
      existingRows: rows,
    });
    expect(plan.updates.find((u) => u.taskId === 1)?.ownerPersonId).toBeNull();
  });
});

describe("planMeetingTaskSync: legacy rows and the editor path", () => {
  it("adopts legacy rows (no action id) by unique text, stamping the stable id", () => {
    const legacyRows: SyncTaskRow[] = BASE_TEXTS.map((text, i) => ({
      id: i + 1,
      actionId: null,
      sourceLine: 9 + i,
      text,
      status: null,
    }));
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: BASE_MD,
      existingRows: legacyRows,
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.archiveTaskIds).toEqual([]);
    expect(plan.updates.map((u) => u.taskId).sort()).toEqual([1, 2, 3]);
    // Every update stamps the contract's stable id onto the legacy row.
    expect(new Set(plan.updates.map((u) => u.actionId))).toEqual(
      new Set(CONTRACT.map((a) => a.actionId)),
    );
  });

  it("editor path (no contract): rows' own action ids keep identity across reorder", () => {
    const rows = rowsAfterFirstSave();
    const reordered = [md(BASE_TEXTS[1], 9), md(BASE_TEXTS[2], 10), md(BASE_TEXTS[0], 11)];
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: null, // editor/manual save
      mdItems: reordered,
      existingRows: rows,
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.archiveTaskIds).toEqual([]);
    const byTask = new Map(plan.updates.map((u) => [u.taskId, u.text]));
    expect(byTask.get(1)).toBe(BASE_TEXTS[0]);
    expect(byTask.get(2)).toBe(BASE_TEXTS[1]);
  });

  it("REACTIVATION lifecycle: a removed-then-returned action reuses its task and leaves archived", () => {
    // 1) Action exists (first save).
    const first = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: BASE_MD,
      existingRows: [],
    });
    expect(first.inserts).toHaveLength(3);

    // 2) The middle action is removed: its row is archived.
    const rows = rowsAfterFirstSave();
    const removed = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: [md(BASE_TEXTS[0], 9), md(BASE_TEXTS[2], 10)],
      existingRows: rows,
    });
    expect(removed.archiveTaskIds).toEqual([2]);

    // 3) The identical action returns; row 2 is now archived in the DB.
    const rowsWithArchived = rows.map((r) =>
      r.id === 2 ? { ...r, status: ARCHIVED_STATUS } : r,
    );
    const returned = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: BASE_MD,
      existingRows: rowsWithArchived,
    });
    // 4) Same task and action id are reused; 5) status restores from archived
    // (reactivate) — and ONLY on that row; 6) no duplicate task is inserted.
    expect(returned.inserts).toEqual([]);
    expect(returned.archiveTaskIds).toEqual([]);
    const revived = returned.updates.find((u) => u.taskId === 2);
    expect(revived?.actionId).toBe(CONTRACT[1].actionId);
    expect(revived?.reactivate).toBe(true);
    for (const u of returned.updates.filter((x) => x.taskId !== 2)) {
      expect(u.reactivate).toBe(false); // active rows' statuses untouched
    }
  });

  it("a REJECTED action never reactivates its archived row", () => {
    const reviewed = applyActionReviews(
      CONTRACT,
      [{ actionId: CONTRACT[1].actionId, state: "rejected" }],
      "jordan",
    );
    const rowsWithArchived = rowsAfterFirstSave().map((r) =>
      r.id === 2 ? { ...r, status: ARCHIVED_STATUS } : r,
    );
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: reviewed,
      mdItems: BASE_MD, // the rejected line is still rendered in the note
      existingRows: rowsWithArchived,
    });
    // The archived row is matched (not re-archived) but stays archived: no
    // update touches it and no reactivation happens.
    expect(plan.archiveTaskIds).toEqual([]);
    expect(plan.updates.some((u) => u.taskId === 2)).toBe(false);
    expect(plan.inserts).toEqual([]);
  });

  it("already-archived rows are not re-archived", () => {
    const rows: SyncTaskRow[] = [
      ...rowsAfterFirstSave(),
      { id: 9, actionId: "act_gone00000000000000000", sourceLine: 20, text: "Old removed action.", status: ARCHIVED_STATUS },
    ];
    const plan = planMeetingTaskSync({
      namespace: NS,
      contractActions: CONTRACT,
      mdItems: BASE_MD,
      existingRows: rows,
    });
    expect(plan.archiveTaskIds).toEqual([]);
  });
});

describe("reconcileBlocker: reconcile-existing must fail loudly, never falsely succeed", () => {
  it("no blocker when the meeting row and its content are present", () => {
    expect(reconcileBlocker(true, true)).toBeNull();
  });

  it("blocks when the meeting row cannot be found", () => {
    expect(reconcileBlocker(false, false)).toMatch(/not found/i);
  });

  it("blocks when the meeting has no stored content", () => {
    expect(reconcileBlocker(true, false)).toMatch(/no stored content/i);
  });
});

describe("selectReconcileTarget: authoritative identity, never first-match by filename", () => {
  const R = (id: number, sourcePath: string | null, granolaId: string | null) => ({
    id,
    sourcePath,
    granolaId,
  });

  it("exact granola id wins, even when paths and basenames disagree", () => {
    const rows = [
      R(1, "Merit/Meetings/2026-07-20 Sync.md", "gran-A"),
      R(2, "Sloan/Meetings/2026-07-20 Sync.md", "gran-B"),
    ];
    const res = selectReconcileTarget(rows, {
      path: "Somewhere/Else/2026-07-20 Sync.md",
      granolaId: "gran-B",
    });
    expect(res).toEqual({ ok: true, row: rows[1] });
  });

  it("exact source path wins when no granola id matches", () => {
    const rows = [
      R(1, "Merit/Meetings/2026-07-20 Sync.md", null),
      R(2, "Sloan/Meetings/2026-07-20 Sync.md", null),
    ];
    const res = selectReconcileTarget(rows, {
      path: "Sloan/Meetings/2026-07-20 Sync.md",
      granolaId: "gran-unknown",
    });
    expect(res).toEqual({ ok: true, row: rows[1] });
  });

  it("legacy basename fallback succeeds only with exactly one match", () => {
    const rows = [
      R(1, "Merit/Meetings/2026-07-20 Sync.md", null),
      R(2, "Merit/Meetings/2026-07-21 Other.md", null),
    ];
    const res = selectReconcileTarget(rows, {
      path: "Staged/Path/2026-07-20 Sync.md", // different folder, same filename
      granolaId: null,
    });
    expect(res).toEqual({ ok: true, row: rows[0] });
  });

  it("duplicate basenames under different paths fail as ambiguous", () => {
    const rows = [
      R(1, "Merit/Meetings/2026-07-20 Sync.md", null),
      R(2, "Sloan/Meetings/2026-07-20 Sync.md", null),
    ];
    const res = selectReconcileTarget(rows, {
      path: "Staged/2026-07-20 Sync.md",
      granolaId: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/ambiguous/i);
  });

  it("no match at all fails rather than picking anything", () => {
    const rows = [R(1, "Merit/Meetings/2026-07-19 Standup.md", "gran-Z")];
    const res = selectReconcileTarget(rows, {
      path: "Staged/2026-07-20 Sync.md",
      granolaId: "gran-Q",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no stored meeting/i);
  });
});
