import { describe, it, expect } from "vitest";
import { cleanTaskTitle, quoteHrefForTask, toTaskView } from "./taskView";
import type { Task } from "./vault/types";

describe("cleanTaskTitle", () => {
  it("strips inline field markers", () => {
    expect(cleanTaskTitle("Send drawing [customer:: [[Stryker]]] [due:: 2026-08-01]")).toBe(
      "Send drawing",
    );
  });

  it("collapses extra whitespace", () => {
    expect(cleanTaskTitle("Send   drawing   to   Stryker")).toBe("Send drawing to Stryker");
  });

  it("leaves a plain title untouched", () => {
    expect(cleanTaskTitle("Get quote approval from Mike")).toBe("Get quote approval from Mike");
  });
});

describe("quoteHrefForTask", () => {
  it("carries the customer, desc, and a parse blob built from title/description/notes", () => {
    const href = quoteHrefForTask({
      customer: "Duran",
      title: "Get quote approval from Mike [customer:: [[Duran]]]",
      description: "Sterile 6 cc Luer Lock syringe.",
      notes: undefined,
    });
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/quote");
    expect(url.searchParams.get("customer")).toBe("Duran");
    expect(url.searchParams.get("desc")).toBe("Get quote approval from Mike");
    expect(url.searchParams.get("parse")).toBe(
      "Get quote approval from Mike\nSterile 6 cc Luer Lock syringe.",
    );
  });

  it("omits customer when internal", () => {
    const href = quoteHrefForTask({
      customer: "internal",
      title: "Follow up",
      description: undefined,
      notes: undefined,
    });
    const url = new URL(href, "http://x");
    expect(url.searchParams.has("customer")).toBe(false);
  });

  it("omits parse when there is nothing to carry", () => {
    const href = quoteHrefForTask({ customer: undefined, title: "", description: undefined, notes: undefined });
    const url = new URL(href, "http://x");
    expect(url.searchParams.has("parse")).toBe(false);
  });
});

describe("toTaskView: source-meeting provenance pass-through", () => {
  const base = {
    done: false,
    title: "Send the forecast",
    fields: {},
    description: "",
    notes: "",
    sourceFile: "300 Merit/Meetings/m.md",
    sourceLine: 9,
  };

  it("carries sourceMeeting through to the view", () => {
    const v = toTaskView({
      ...base,
      sourceMeeting: { id: 7, title: "Intuitive weekly sync", date: "2026-07-20", path: "300 Merit/Meetings/x.md" },
    } as Task);
    expect(v.sourceMeeting).toEqual({
      id: 7,
      title: "Intuitive weekly sync",
      date: "2026-07-20",
      path: "300 Merit/Meetings/x.md",
    });
  });

  it("is absent for vault-born tasks (parser never sets it)", () => {
    const v = toTaskView({ ...base } as Task);
    expect(v.sourceMeeting).toBeUndefined();
  });
});
