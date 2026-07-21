import { TASK_TYPES, type TaskType } from "@/lib/taskType";
import type { TaskView } from "@/lib/taskView";

// Pure logic for the /tasks inline edit affordances (dev-feedback #8): account,
// type, status, due date. Kept framework-free so the API route and the client
// optimistic update can share one source of truth, tested without a DB.

export const TASK_UPDATE_FIELDS = ["account", "type", "status", "due", "delegate"] as const;
export type TaskUpdateField = (typeof TASK_UPDATE_FIELDS)[number];

export const TASK_STATUSES = ["open", "waiting", "blocked", "someday"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Wire format for "delegate" (dev-feedback #20): people.id as a stringified
// integer, e.g. "42", empty string to clear. people.email is nullable (a
// delegate may have no email on file yet), so the numeric primary key is the
// only value guaranteed to identify a person; it also matches
// tasks.ownerPersonId's own column type exactly, no secondary lookup needed
// to write it.
const PERSON_ID_RE = /^\d+$/;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class TaskUpdateError extends Error {}

export interface ValidatedTaskUpdate {
  field: TaskUpdateField;
  // Normalized value to write. null means "clear this field."
  value: string | null;
}

// Validate a single-field task update. accountNames is the list of known
// account display names (case-insensitive match); knownPersonIds is the list
// of real people.id values a "delegate" update may reference. Both are
// looked up by the caller so this function stays pure and DB-free.
export function validateTaskUpdate(
  input: { field: unknown; value: unknown },
  accountNames: string[],
  knownPersonIds: number[] = [],
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
    case "delegate": {
      if (!value) return { field: "delegate", value: null };
      if (!PERSON_ID_RE.test(value)) {
        throw new TaskUpdateError(`Invalid delegate id: ${value}`);
      }
      if (!knownPersonIds.includes(Number(value))) {
        throw new TaskUpdateError(`Unknown person: ${value}`);
      }
      return { field: "delegate", value };
    }
  }
}

// Status chip text (dev-feedback #20 item 2): Jordan's complaint was that
// "waiting on someone else" and "not started yet" looked identical. When a
// task is waiting AND has a delegate, name the person ("Waiting on Scott")
// so the chip itself answers "waiting on what." With no delegate, "Waiting"
// alone still reads fine.
export function taskStatusLabel(
  status: string | null | undefined,
  delegateName?: string | null,
): string {
  const s = (status ?? "").toLowerCase();
  if (s === "waiting") return delegateName ? `Waiting on ${delegateName}` : "Waiting";
  if (s === "blocked") return "Blocked";
  if (s === "someday") return "Someday";
  return "Open";
}

// Tailwind classes for the status chip, distinct per status so "waiting"
// no longer renders identically to "open" (dev-feedback #20's core
// complaint). Reuses this app's existing semantic tokens (tailwind.config.ts)
// rather than inventing new colors: info (blue, "in motion") for waiting,
// due (red) for blocked, a quiet neutral for someday/open.
export function taskStatusColorClass(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "waiting") return "border-info/30 bg-info/10 text-info";
  if (s === "blocked") return "border-due/30 bg-due/10 text-due";
  return "border-border bg-surface2 text-muted";
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
    case "delegate":
      // Delegate carries a richer shape (person id + display name + email)
      // than the plain-string value this generic path deals in, and the
      // caller already has that shape in hand at selection time (the person
      // search result), so TasksTable/TasksGrouped apply it to the row
      // directly instead of round-tripping it through here. This case exists
      // only so the switch stays exhaustive over TaskUpdateField.
      return view;
  }
}
