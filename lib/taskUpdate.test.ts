import { describe, it, expect } from "vitest";
import {
  validateTaskUpdate,
  applyTaskFieldUpdate,
  taskStatusLabel,
  taskStatusColorClass,
  TaskUpdateError,
} from "./taskUpdate";
import type { TaskView } from "./taskView";

const ACCOUNTS = ["Boston Scientific", "Terumo Medical"];
const PERSON_IDS = [7, 42];

function view(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: "300 Merit/Tasks/foo.md:3",
    title: "Send PCN update",
    done: false,
    type: "Admin/Other",
    sourceFile: "300 Merit/Tasks/foo.md",
    sourceLine: 3,
    ...overrides,
  };
}

describe("validateTaskUpdate", () => {
  it("accepts a known account, case-insensitive, and returns the canonical name", () => {
    expect(validateTaskUpdate({ field: "account", value: "terumo medical" }, ACCOUNTS)).toEqual({
      field: "account",
      value: "Terumo Medical",
    });
  });

  it("clears the account on an empty value", () => {
    expect(validateTaskUpdate({ field: "account", value: "" }, ACCOUNTS)).toEqual({
      field: "account",
      value: null,
    });
  });

  it("rejects an unknown account", () => {
    expect(() => validateTaskUpdate({ field: "account", value: "Not A Real Co" }, ACCOUNTS)).toThrow(
      TaskUpdateError,
    );
  });

  it("accepts a valid task type", () => {
    expect(validateTaskUpdate({ field: "type", value: "PCN" }, ACCOUNTS)).toEqual({
      field: "type",
      value: "PCN",
    });
  });

  it("rejects an unknown task type", () => {
    expect(() => validateTaskUpdate({ field: "type", value: "Not A Type" }, ACCOUNTS)).toThrow(
      TaskUpdateError,
    );
  });

  it("maps 'open' status to a cleared column", () => {
    expect(validateTaskUpdate({ field: "status", value: "open" }, ACCOUNTS)).toEqual({
      field: "status",
      value: null,
    });
  });

  it("accepts a valid status", () => {
    expect(validateTaskUpdate({ field: "status", value: "blocked" }, ACCOUNTS)).toEqual({
      field: "status",
      value: "blocked",
    });
  });

  it("rejects an unknown status", () => {
    expect(() => validateTaskUpdate({ field: "status", value: "whenever" }, ACCOUNTS)).toThrow(
      TaskUpdateError,
    );
  });

  it("accepts an ISO due date", () => {
    expect(validateTaskUpdate({ field: "due", value: "2026-08-01" }, ACCOUNTS)).toEqual({
      field: "due",
      value: "2026-08-01",
    });
  });

  it("clears the due date on an empty value", () => {
    expect(validateTaskUpdate({ field: "due", value: "" }, ACCOUNTS)).toEqual({
      field: "due",
      value: null,
    });
  });

  it("rejects a non-ISO due date", () => {
    expect(() => validateTaskUpdate({ field: "due", value: "8/1/2026" }, ACCOUNTS)).toThrow(
      TaskUpdateError,
    );
  });

  it("rejects an unsupported field", () => {
    expect(() => validateTaskUpdate({ field: "priority", value: "high" }, ACCOUNTS)).toThrow(
      TaskUpdateError,
    );
  });

  it("accepts a known delegate person id", () => {
    expect(
      validateTaskUpdate({ field: "delegate", value: "42" }, ACCOUNTS, PERSON_IDS),
    ).toEqual({ field: "delegate", value: "42" });
  });

  it("clears the delegate on an empty value", () => {
    expect(validateTaskUpdate({ field: "delegate", value: "" }, ACCOUNTS, PERSON_IDS)).toEqual({
      field: "delegate",
      value: null,
    });
  });

  it("rejects a delegate id that is not a known person", () => {
    expect(() =>
      validateTaskUpdate({ field: "delegate", value: "999" }, ACCOUNTS, PERSON_IDS),
    ).toThrow(TaskUpdateError);
  });

  it("rejects a non-numeric delegate value", () => {
    expect(() =>
      validateTaskUpdate({ field: "delegate", value: "scott" }, ACCOUNTS, PERSON_IDS),
    ).toThrow(TaskUpdateError);
  });
});

describe("taskStatusLabel", () => {
  it("combines waiting with the delegate's name", () => {
    expect(taskStatusLabel("waiting", "Scott Ridley")).toBe("Waiting on Scott Ridley");
  });

  it("falls back to plain 'Waiting' with no delegate", () => {
    expect(taskStatusLabel("waiting", null)).toBe("Waiting");
    expect(taskStatusLabel("waiting")).toBe("Waiting");
  });

  it("ignores the delegate name for non-waiting statuses", () => {
    expect(taskStatusLabel("blocked", "Scott Ridley")).toBe("Blocked");
    expect(taskStatusLabel("someday", "Scott Ridley")).toBe("Someday");
  });

  it("defaults to Open", () => {
    expect(taskStatusLabel(undefined)).toBe("Open");
    expect(taskStatusLabel(null)).toBe("Open");
    expect(taskStatusLabel("open")).toBe("Open");
  });
});

describe("taskStatusColorClass", () => {
  it("gives waiting a distinct color from open", () => {
    expect(taskStatusColorClass("waiting")).not.toBe(taskStatusColorClass("open"));
    expect(taskStatusColorClass("waiting")).not.toBe(taskStatusColorClass(undefined));
  });

  it("gives blocked its own color", () => {
    expect(taskStatusColorClass("blocked")).not.toBe(taskStatusColorClass("waiting"));
  });
});

describe("applyTaskFieldUpdate", () => {
  it("updates the customer and drops the stale accountSlug", () => {
    const t = view({ customer: "Old Co", accountSlug: "old-co" });
    const next = applyTaskFieldUpdate(t, "account", "Terumo Medical");
    expect(next.customer).toBe("Terumo Medical");
    expect(next.accountSlug).toBeUndefined();
  });

  it("clears the account", () => {
    const t = view({ customer: "Old Co", accountSlug: "old-co" });
    const next = applyTaskFieldUpdate(t, "account", null);
    expect(next.customer).toBeUndefined();
  });

  it("updates the task type", () => {
    const next = applyTaskFieldUpdate(view(), "type", "Pricing/Quote");
    expect(next.type).toBe("Pricing/Quote");
  });

  it("updates the status and clears it back to open", () => {
    const withStatus = applyTaskFieldUpdate(view(), "status", "waiting");
    expect(withStatus.taskStatus).toBe("waiting");
    const cleared = applyTaskFieldUpdate(withStatus, "status", null);
    expect(cleared.taskStatus).toBeUndefined();
  });

  it("updates the due date", () => {
    const next = applyTaskFieldUpdate(view(), "due", "2026-08-01");
    expect(next.due).toBe("2026-08-01");
  });

  it("leaves the source untouched", () => {
    const t = view();
    const next = applyTaskFieldUpdate(t, "due", "2026-08-01");
    expect(next.sourceFile).toBe(t.sourceFile);
    expect(next.sourceLine).toBe(t.sourceLine);
  });

  it("delegate is a no-op here: callers apply it directly (see TasksTable/TasksGrouped)", () => {
    const t = view({ delegatedTo: { personId: 1, name: "Scott Ridley" } });
    const next = applyTaskFieldUpdate(t, "delegate", "1");
    expect(next.delegatedTo).toEqual({ personId: 1, name: "Scott Ridley" });
  });
});
