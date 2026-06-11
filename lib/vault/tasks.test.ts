import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTasks, scanInlineFields } from "./tasks";

const fx = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("inline field scanner", () => {
  it("handles nested wikilinks without mistaking ]] for the field close", () => {
    const { fields, remainder } = scanInlineFields(
      "    [customer:: [[Trelleborg]]] [due:: 2026-05-21] [priority:: high]",
    );
    expect(fields.customer).toBe("[[Trelleborg]]");
    expect(fields.due).toBe("2026-05-21");
    expect(fields.priority).toBe("high");
    expect(remainder).toBe("");
  });

  it("leaves prose with inline wikilinks as remainder, not fields", () => {
    const { fields, remainder } = scanInlineFields(
      "    Send [[Skyler Freeman]] and Will Lay the disposition.",
    );
    expect(Object.keys(fields)).toHaveLength(0);
    expect(remainder).toContain("Send");
  });
});

describe("task parser (fixture 1: all fields + draft + thread)", () => {
  const tasks = parseTasks(fx("tasks.md"), "300 Merit/Projects/Trelleborg.md");

  it("parses the open task with every field", () => {
    const t = tasks[0];
    expect(t.done).toBe(false);
    expect(t.title).toBe("Notify planning team on Trelleborg stopcock status");
    expect(t.customer).not.toBe("internal");
    expect((t.customer as { display: string }).display).toBe("Trelleborg");
    expect(t.due).toBe("2026-05-21");
    expect(t.priority).toBe("high");
    expect(t.draft?.display).toBe("trelleborg-gore-ncr-stopcocks-skyler");
    expect(t.thread).toBe("#5");
    expect(t.description).toContain("Send [[Skyler Freeman]]");
    expect(t.workstream).toBe("merit"); // inherited from frontmatter
    expect(t.sourceFile).toBe("300 Merit/Projects/Trelleborg.md");
  });

  it("captures source line for write-back", () => {
    // The open task checkbox is on line index 9 (0-based) in the fixture.
    expect(tasks[0].sourceLine).toBe(9);
  });
});

describe("task parser (fixture 2: done task with completed)", () => {
  const tasks = parseTasks(fx("tasks.md"));

  it("parses the done task and its completed date and Notes signal", () => {
    const done = tasks.find((t) => t.done);
    expect(done).toBeDefined();
    expect(done!.title).toBe("Close out the old PCN packet");
    expect(done!.completed).toBe("2026-05-18");
    expect(done!.priority).toBe("med");
    expect(done!.notes).toBe("sent");
  });
});
