import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoster, classifyName, setPersonOverride } from "./roster";

const fx = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("setPersonOverride + account-aware Team Overrides", () => {
  const base = `# Roster\n\n## Merit Internal People\n[[Ben Skousen]]\n\n## Team Overrides\n- Kirk = merit\n`;

  it("adds a new internal override", () => {
    const out = setPersonOverride(base, "Jordan Francis", "merit");
    expect(out).toContain("- Jordan Francis = merit");
    expect(
      classifyName(parseRoster(out), "Jordan Francis")?.classification,
    ).toBe("merit");
  });

  it("adds a customer override with an account, parsed back", () => {
    const out = setPersonOverride(base, "Jane Doe", "customer", "Stryker");
    expect(out).toContain("- Jane Doe = customer ([[Stryker]])");
    const e = classifyName(parseRoster(out), "Jane Doe");
    expect(e?.classification).toBe("customer");
    expect(e?.account).toBe("Stryker");
  });

  it("updates an existing override in place (no duplicate)", () => {
    const once = setPersonOverride(base, "Kirk", "customer", "Gore");
    const e = classifyName(parseRoster(once), "Kirk");
    expect(e?.classification).toBe("customer");
    expect(e?.account).toBe("Gore");
    expect(once.match(/Kirk =/g)).toHaveLength(1);
  });

  it("creates the section when absent", () => {
    const out = setPersonOverride(
      "# Roster\n\n## Leadership\n[[Mike]]\n",
      "X",
      "merit",
    );
    expect(out).toContain("## Team Overrides");
    expect(out).toContain("- X = merit");
  });
});

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
