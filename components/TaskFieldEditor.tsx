"use client";

import { useState, type ReactNode } from "react";
import { PencilIcon, PlusIcon } from "./icons";

// Established-value display for the /tasks inline-edit fields (dev-feedback
// #19). Jordan's complaint about the original dev-feedback #8 build: a field
// that already has a settled value showed as a live, raw <select>/date input
// sitting open by default, which read as unfinished, not like a fact about
// the task. His ask: "things that are already established should remain
// established, but can be edited if needs be. change to things like Add
// button, then pop ups."
//
// This component is the one place that interaction now lives, so every field
// (account, type, status, due) gets it for free instead of four one-off
// inline conditionals:
//   - a set value renders as the same settled chip the read-only views use
//     (TaskRow.tsx, chips.tsx), with a small pencil affordance on hover;
//   - an unset value renders an explicit "+ Add X" button instead of an
//     empty control sitting open;
//   - either one, clicking reveals the real control (passed in via the
//     renderControl render-prop, so callers keep their own <select>/<input>)
//     plus Save/Cancel. Save calls the caller's onSave (the existing
//     optimistic-update-with-rollback path in TasksTable.tsx); Cancel just
//     closes without touching the task.
//
// Kept as a real, reusable component (not inline JSX) so a future richer
// popover (e.g. AI drafting on some other field) has a place to slot in
// without another redesign of this interaction, per Jordan's "with the
// available drafting etc." aside.
export default function TaskFieldEditor<T>({
  chip,
  emptyLabel,
  initialValue,
  onSave,
  error,
  renderControl,
}: {
  // The settled display for a field that already has a value, or null when
  // the field is unset (renders the "+ Add" button instead).
  chip: ReactNode | null;
  // e.g. "Add account", "Add due date".
  emptyLabel: string;
  initialValue: T;
  onSave: (value: T) => void;
  error?: string;
  // The actual editable control (a <select>, a date <input>, etc). Receives
  // the in-progress value and a setter; the caller owns what the control
  // looks like, this component owns open/close and Save/Cancel.
  renderControl: (value: T, setValue: (v: T) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<T>(initialValue);

  function openEditor() {
    setValue(initialValue);
    setOpen(true);
  }
  function save() {
    onSave(value);
    setOpen(false);
  }
  function cancel() {
    setOpen(false);
  }

  // The failure path is optimistic, same as the caller's rollback: Save
  // closes the editor right away, and if the write fails the row's value
  // (and this chip) revert on the next render while `error` stays visible
  // underneath, so it needs to render regardless of open/closed state.
  return (
    <div>
      {open ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {renderControl(value, setValue)}
          <button type="button" onClick={save} className="btn btn-primary px-2 py-0.5 text-2xs">
            Save
          </button>
          <button type="button" onClick={cancel} className="btn btn-ghost px-2 py-0.5 text-2xs">
            Cancel
          </button>
        </div>
      ) : chip ? (
        <button
          type="button"
          onClick={openEditor}
          className="group inline-flex items-center gap-1"
          title="Click to edit"
        >
          {chip}
          <PencilIcon className="h-3 w-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-70" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line2 px-2 py-0.5 text-2xs text-muted transition-colors hover:border-[color:var(--accent)] hover:text-fg"
        >
          <PlusIcon className="h-2.5 w-2.5" />
          {emptyLabel}
        </button>
      )}
      {error ? <p className="mt-0.5 text-2xs text-danger">{error}</p> : null}
    </div>
  );
}
