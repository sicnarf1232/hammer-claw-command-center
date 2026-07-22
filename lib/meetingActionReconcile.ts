// Pure reconciliation model for meeting action items -> task rows.
//
// This module has NO database dependency. It is a faithful, unit-testable model
// of the CURRENT reconciliation logic inside `dbSaveMeetingContent()` in
// `lib/meetingsDb.ts` (verified 2026-07-22 against lib/meetingsDb.ts:218-249).
//
// The production writer keeps a meeting's task rows in step with its parsed
// action items like this:
//
//   const byLine = new Map(taskRows.map((t) => [t.sourceLine, t.id])); // :223
//   for (const ai of note.actionItems) {                              // :224
//     const hit = byLine.get(ai.sourceLine);                          // :234
//     if (hit != null) { update task #hit }                           // :235-236
//     else { insert a new task at ai.sourceLine }                     // :237-247
//   }
//
// Two properties of that loop are the whole point of Slice A:
//
//   1. Identity is the Markdown source line number (`sourceLine`). Nothing
//      about the action text, its owner, or a stable action id takes part in
//      the match. Move a line and its identity moves with the line number, not
//      with the action.
//   2. The writer never deletes and never archives. An existing task row whose
//      `sourceLine` no longer appears among the parsed actions is simply left
//      alone: it is neither updated nor superseded. It STRANDS as a live task.
//      (meetingsDb.ts comment at :208-210 is explicit: "Never deletes.")
//
// This model exposes those three outcomes (updates, inserts, stranded) so tests
// can pin the current behavior and label the desired stable-id behavior for
// Slice D. The production writer is intentionally left untouched; this is a
// read-only model of it, not a replacement.

export interface ReconcileAction {
  // 0-based Markdown line index of the action's checkbox line, exactly as
  // `parseMeetingNote(...).actionItems[i].sourceLine` produces it. This is the
  // ONLY thing the current writer keys on.
  sourceLine: number;
  // The action text (owner prefix stripped), carried so a match can be shown to
  // update wording in place. Not used for matching today.
  text: string;
}

export interface ExistingTaskRow {
  id: number;
  sourceLine: number;
}

export interface ReconcileUpdate {
  id: number; // the existing task row this action updated (by line)
  sourceLine: number;
  text: string; // the incoming (possibly reworded) action text
}

export interface ReconcileResult {
  // Existing rows updated in place because an action shared their source line.
  updates: ReconcileUpdate[];
  // Actions with no existing row on their source line: inserted as new tasks.
  inserts: ReconcileAction[];
  // Existing rows whose source line no longer appears among the actions. The
  // current writer neither updates nor archives these, so they remain as live,
  // now-orphaned task rows. This is the "stale task" / "stranded row" risk.
  stranded: ExistingTaskRow[];
}

// Model of `dbSaveMeetingContent`'s task synchronization. Given the parsed
// action items of the (possibly edited) note and the meeting's existing task
// rows, return which rows are updated, which actions are inserted, and which
// existing rows strand. Pure and order-preserving, matching the production loop.
export function reconcileActionsByLine(
  actions: ReconcileAction[],
  existingRows: ExistingTaskRow[],
): ReconcileResult {
  // `new Map(...)` keyed by sourceLine: on a duplicate source line the LAST row
  // wins, exactly as `new Map(taskRows.map(...))` does in meetingsDb.ts:223.
  const byLine = new Map<number, number>();
  for (const row of existingRows) byLine.set(row.sourceLine, row.id);

  const updates: ReconcileUpdate[] = [];
  const inserts: ReconcileAction[] = [];
  const matchedIds = new Set<number>();

  for (const action of actions) {
    const hit = byLine.get(action.sourceLine);
    if (hit != null) {
      updates.push({ id: hit, sourceLine: action.sourceLine, text: action.text });
      matchedIds.add(hit);
    } else {
      inserts.push(action);
    }
  }

  // Any existing row whose id was never the target of an update strands: the
  // writer does not touch it. A row shadowed by a duplicate source line strands
  // too, which mirrors the Map-last-wins behavior above.
  const stranded = existingRows.filter((row) => !matchedIds.has(row.id));

  return { updates, inserts, stranded };
}

// Convenience for characterizing a two-pass edit: the state right after the
// first save is one task row per action, in order, keyed by the action's source
// line. Modeling helper only; the production insert path assigns real ids.
export function rowsAfterFirstSave(
  actions: ReconcileAction[],
  startId = 1,
): ExistingTaskRow[] {
  return actions.map((a, i) => ({ id: startId + i, sourceLine: a.sourceLine }));
}
