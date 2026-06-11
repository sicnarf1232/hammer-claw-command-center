import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitFrontmatter } from "./frontmatter";

const fx = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("frontmatter parser", () => {
  it("splits YAML frontmatter from body", () => {
    const { frontmatter, body } = splitFrontmatter(fx("tasks.md"));
    expect(frontmatter.workstream).toBe("merit");
    expect(frontmatter.type).toBe("project");
    expect(frontmatter.status).toBe("active");
    expect(frontmatter.created).toBe("2026-05-20");
    expect(body.startsWith("\n# Trelleborg work")).toBe(true);
  });

  it("parses array and quoted values from a meeting note", () => {
    const { frontmatter } = splitFrontmatter(fx("meeting.md"));
    expect(frontmatter.raw.attendees).toEqual([
      "Jordan Francis",
      "Haley Nelson",
      "Scott Taylor",
      "Ben Skousen",
      "Daniel Koi",
    ]);
    expect(frontmatter.raw.customer).toBe("[[MicroVention Terumo]]");
    expect(frontmatter.raw.granola_id).toBe(
      "d1d749cd-99a7-4f72-9e59-4dcbabc15f92",
    );
  });

  it("tolerates a document with no frontmatter", () => {
    const { frontmatter, body } = splitFrontmatter("# Just a heading\n\ntext");
    expect(frontmatter.raw).toEqual({});
    expect(body).toBe("# Just a heading\n\ntext");
  });

  it("tolerates an unterminated frontmatter fence", () => {
    const { frontmatter } = splitFrontmatter("---\nworkstream: merit\n# oops");
    expect(frontmatter.raw).toEqual({});
  });
});
