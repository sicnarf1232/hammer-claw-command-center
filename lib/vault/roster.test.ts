import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoster, classifyName } from "./roster";

const fx = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("roster parser", () => {
  const roster = parseRoster(fx("roster.md"));

  it("classifies Leadership and Merit Internal People as merit", () => {
    expect(classifyName(roster, "Haley Nelson")?.classification).toBe("merit");
    expect(classifyName(roster, "Scott Taylor")?.classification).toBe("merit");
    expect(classifyName(roster, "Ben Skousen")?.classification).toBe("merit");
  });

  it("classifies Customer Contacts as customer with their account", () => {
    const zoya = classifyName(roster, "Zoya Petrova");
    expect(zoya?.classification).toBe("customer");
    expect(zoya?.account).toBe("MicroVention Terumo");
    expect(classifyName(roster, "Chris Dopuch")?.account).toBe("Stryker");
  });

  it("applies Team Overrides last (fixture 5: Kirk = merit wins)", () => {
    // Kirk appears in Leadership (merit) AND Customer Contacts (customer).
    // The override resolves the collision to merit.
    expect(classifyName(roster, "Kirk")?.classification).toBe("merit");
  });

  it("returns undefined for unknown names rather than throwing", () => {
    expect(classifyName(roster, "Nobody Atall")).toBeUndefined();
  });
});
