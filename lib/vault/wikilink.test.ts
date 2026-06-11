import { describe, it, expect } from "vitest";
import { parseWikilinkBody, parseAllWikilinks } from "./wikilink";

describe("wikilink parser", () => {
  it("parses a plain target", () => {
    const wl = parseWikilinkBody("Trelleborg");
    expect(wl.target).toBe("Trelleborg");
    expect(wl.basename).toBe("Trelleborg");
    expect(wl.alias).toBeUndefined();
    expect(wl.display).toBe("Trelleborg");
  });

  it("parses an alias form (fixture 6)", () => {
    const wl = parseWikilinkBody("Target|Alias");
    expect(wl.target).toBe("Target");
    expect(wl.alias).toBe("Alias");
    expect(wl.display).toBe("Alias");
  });

  it("parses a path-qualified form (fixture 6)", () => {
    const wl = parseWikilinkBody("memory/people/Scott|Scott");
    expect(wl.target).toBe("memory/people/Scott");
    expect(wl.basename).toBe("Scott");
    expect(wl.alias).toBe("Scott");
    expect(wl.display).toBe("Scott");
  });

  it("finds multiple links in prose", () => {
    const links = parseAllWikilinks(
      "Send [[Skyler Freeman]] and ping [[memory/people/Will|Will]]",
    );
    expect(links.map((l) => l.display)).toEqual(["Skyler Freeman", "Will"]);
  });
});
