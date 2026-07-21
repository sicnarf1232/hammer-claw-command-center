"use client";

import { useState } from "react";
import { formatDateShort } from "@/lib/dates";
import { stepDueColor } from "@/lib/checklistProgress";

// The per-step due date affordance shared by both checklist UIs (TasksTable's
// TaskSubitems and TasksGrouped's TaskCard "Internal progress"). Three states:
// - dated step: a small "JUL 27" chip, urgency-colored via stepDueColor;
//   click it to edit or clear the date (the click-to-edit spirit of
//   TaskFieldEditor, but light enough to live inside a checklist row).
// - undated step: renders nothing until the row is hovered (Tailwind `group`),
//   then a tiny "date" affordance, so existing dateless steps look exactly
//   as they did before this feature.
// - editing: a bare native date input; picking a date saves it, clearing the
//   input removes it, blur/Enter/Escape closes.
export default function StepDueDate({
  due,
  done,
  today,
  onChange,
}: {
  due?: string | null;
  done: boolean;
  today: string;
  onChange: (due: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        aria-label="Step due date"
        defaultValue={due ?? ""}
        autoFocus
        onChange={(e) => onChange(e.target.value || null)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") setEditing(false);
        }}
        className="input shrink-0 px-1.5 py-0.5 text-2xs"
      />
    );
  }

  if (due) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Change or clear the due date"
        className={`shrink-0 text-2xs font-semibold tabular-nums ${done ? "line-through" : ""}`}
        style={{ color: stepDueColor(due, done, today) }}
      >
        {formatDateShort(due)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Set a due date for this step"
      className="shrink-0 text-2xs text-muted opacity-0 hover:text-fg group-hover:opacity-100"
    >
      date
    </button>
  );
}
