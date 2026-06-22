import { describe, it, expect } from "vitest";
import { personNameMatches, normalizePersonName } from "./people";

describe("personNameMatches", () => {
  it("matches exact and case/space variants", () => {
    expect(personNameMatches("Nick Francis", "nick  francis")).toBe(true);
  });
  it("matches a first-name owner to a full-name attendee", () => {
    expect(personNameMatches("Nick Francis", "Nick")).toBe(true);
    expect(personNameMatches("Nick", "Nick Francis")).toBe(true);
  });
  it("matches on containment", () => {
    expect(personNameMatches("Nick Francis", "Nick Francis (Merit)")).toBe(true);
  });
  it("does not match different people", () => {
    expect(personNameMatches("Nick Francis", "Mike Spencer")).toBe(false);
    expect(personNameMatches("Nick Francis", "Nicole")).toBe(false);
  });
  it("handles empties", () => {
    expect(personNameMatches("", "Nick")).toBe(false);
    expect(normalizePersonName("  A  B ")).toBe("a b");
  });
});
