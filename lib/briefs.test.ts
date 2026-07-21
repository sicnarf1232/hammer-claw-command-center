import { describe, it, expect } from "vitest";
import { structuredFallbackBrief, structuredBriefToMarkdown } from "./briefs";
import type { Task } from "@/lib/vault/types";

function task(overrides: Partial<Task> & { title: string; sourceFile: string; sourceLine: number }): Task {
  return {
    done: false,
    fields: {},
    description: "",
    notes: "",
    ...overrides,
  };
}

describe("structuredFallbackBrief", () => {
  it("builds a due-today, coming-up, and meetings section from the raw data", () => {
    const dueTasks = [
      task({ title: "Send drawing for PN 1234", sourceFile: "a.md", sourceLine: 1, due: "2026-07-20" }),
    ];
    const open = [
      dueTasks[0],
      task({ title: "Follow up with Stryker", sourceFile: "b.md", sourceLine: 2, due: "2026-07-22" }),
    ];
    const todaysMeetings = [{ title: "Weekly sync", bucket: "Internal" }];

    const brief = structuredFallbackBrief({ dueTasks, open, todaysMeetings });

    expect(brief.modelUsed).toBe("fallback");
    expect(brief.headline).toBe("1 due today, 1 meeting");
    const headings = brief.sections.map((s) => s.heading);
    expect(headings).toEqual(["Due today or overdue", "Coming up", "Meetings today"]);
    expect(brief.sections[0].items).toEqual(["Send drawing for PN 1234 (due 2026-07-20)"]);
    expect(brief.sections[1].items).toEqual(["Follow up with Stryker (due 2026-07-22)"]);
    expect(brief.sections[2].items).toEqual(["Weekly sync (Internal)"]);
  });

  it("excludes due tasks from the coming-up section (no duplicates)", () => {
    const dueTasks = [task({ title: "A", sourceFile: "a.md", sourceLine: 1 })];
    const open = [...dueTasks];
    const brief = structuredFallbackBrief({ dueTasks, open, todaysMeetings: [] });
    const comingUp = brief.sections.find((s) => s.heading === "Coming up");
    expect(comingUp).toBeUndefined();
  });

  it("gives a calm headline and no sections when everything is empty", () => {
    const brief = structuredFallbackBrief({ dueTasks: [], open: [], todaysMeetings: [] });
    expect(brief.headline).toBe("Nothing urgent today.");
    expect(brief.sections).toEqual([]);
  });
});

describe("structuredBriefToMarkdown", () => {
  it("renders a headline and headed bullet sections", () => {
    const md = structuredBriefToMarkdown("morning", {
      headline: "2 due today",
      sections: [{ heading: "Due today", items: ["Task one", "Task two"] }],
      modelUsed: "fallback",
    });
    expect(md).toBe(
      ["# Morning Brief", "", "2 due today", "", "## Due today", "", "- Task one", "- Task two"].join("\n"),
    );
  });

  it("renders 'none' for an empty section's items", () => {
    const md = structuredBriefToMarkdown("eod", {
      headline: "",
      sections: [{ heading: "Meetings today", items: [] }],
      modelUsed: "fallback",
    });
    expect(md).toContain("## Meetings today");
    expect(md).toContain("- none");
  });
});
