import { TASK_TYPES, type TaskType } from "@/lib/taskType";
import type { TaskView } from "@/lib/taskView";

// Pure logic for the /tasks inline edit affordances (dev-feedback #8): account,
// type, status, due date. Kept framework-free so the API route and the client
// optimistic update can share one source of truth, tested without a DB.

export const TASK_UPDATE_FIELDS = ["account", "type", "status", "due"] as const;
export type TaskUpdateField = (typeof TASK_UPDATE_FIELDS)[number];

export const TASK_STATUSES = ["open", "waiting", "blocked", "someday"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class TaskUpdateError extends Error {}

export interface ValidatedTaskUpdate {
  field: TaskUpdateField;
  // Normalized value to write. null means "clear this field."
  value: string | null;
}

// Validate a single-field task update. accountNames is the list of known
// account display names (case-insensitive match); the caller looks these up
// so this function stays pure and DB-free.
export function validateTaskUpdate(
  input: { field: unknown; value: unknown },
  accountNames: string[],
): ValidatedTaskUpdate {
  const field = input.field;
  const value = typeof input.value === "string" ? input.value.trim() : "";

  if (typeof field !== "string" || !(TASK_UPDATE_FIELDS as readonly string[]).includes(field)) {
    throw new TaskUpdateError(`Unsupported field: ${String(field)}`);
  }

  switch (field as TaskUpdateField) {
    case "account": {
      if (!value) return { field: "account", value: null };
      const match = accountNames.find((n) => n.toLowerCase() === value.toLowerCase());
      if (!match) throw new TaskUpdateError(`Unknown account: ${value}`);
      return { field: "account", value: match };
    }
    case "type": {
      if (!value) return { field: "type", value: null };
      const match = TASK_TYPES.find((t) => t === value);
      if (!match) throw new TaskUpdateError(`Unknown task type: ${value}`);
      return { field: "type", value: match };
    }
    case "status": {
      if (!value || value === "open") return { field: "status", value: null };
      const match = TASK_STATUSES.find((s) => s === value);
      if (!match) throw new TaskUpdateError(`Unknown status: ${value}`);
      return { field: "status", value: match };
    }
    case "due": {
      if (!value) return { field: "due", value: null };
      if (!ISO_DATE_RE.test(value)) {
        throw new TaskUpdateError("Due date must be an ISO date (YYYY-MM-DD).");
      }
      return { field: "due", value };
    }
  }
}

// Apply a validated update to a client-side TaskView for optimistic UI. The
// server write is the source of truth; this only keeps the on-screen row in
// sync until the next full load, so it does not need to resolve accountSlug.
export function applyTaskFieldUpdate(
  view: TaskView,
  field: TaskUpdateField,
  value: string | null,
): TaskView {
  switch (field) {
    case "account":
      return { ...view, customer: value ?? undefined, accountSlug: undefined };
    case "type":
      return { ...view, type: (value as TaskType | null) ?? "Admin/Other" };
    case "status":
      return { ...view, taskStatus: value ?? undefined };
    case "due":
      return { ...view, due: value ?? undefined };
  }
}
