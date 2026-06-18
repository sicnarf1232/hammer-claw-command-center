import { describe, it, expect } from "vitest";
import { addContactsToNote, normName } from "./contactsWrite";
import { parseAccount } from "./vault/accounts";

const NOTE = `---
type: OEM Account
region: Pacific OEM
account_number: "69249"
---

# Intuitive Surgical

## Overview

Strategic OEM account.

## Key contacts

- **Dr. Amy Lee** — VP Quality, amy.lee@intuitive.com

## Links

- [[Intuitive Surgical Pricing]]
`;

describe("addContactsToNote", () => {
  it("appends new contacts into the existing section, preserving the rest", () => {
    const { content, added } = addContactsToNote(NOTE, [
      { name: "Sam Okoro", email: "sam@intuitive.com" },
      { name: "Priya Shah" },
    ]);
    expect(added).toEqual(["Sam Okoro", "Priya Shah"]);
    expect(content).toContain("- **Dr. Amy Lee** — VP Quality"); // preserved
    expect(content).toContain("- **Sam Okoro** — sam@intuitive.com");
    expect(content).toContain("- **Priya Shah**");
    // The Links section is untouched and still after contacts.
    expect(content.indexOf("## Key contacts")).toBeLessThan(content.indexOf("## Links"));
    // The parser reads the new contacts back.
    const acc = parseAccount(content, "300 Merit/Customers/Intuitive Surgical.md");
    expect(acc.contacts.map((c) => c.name)).toContain("Sam Okoro");
    expect(acc.contacts.find((c) => c.name === "Sam Okoro")?.email).toBe("sam@intuitive.com");
  });

  it("does not duplicate an existing contact (normalized match)", () => {
    const { content, added } = addContactsToNote(NOTE, [{ name: "dr amy lee" }]);
    expect(added).toEqual([]);
    expect(content).toBe(NOTE.replace(/\r\n/g, "\n"));
  });

  it("dedupes within the input batch", () => {
    const { added } = addContactsToNote(NOTE, [
      { name: "Nina Cole" },
      { name: "Nina  Cole" },
    ]);
    expect(added).toEqual(["Nina Cole"]);
  });

  it("creates a Key contacts section when none exists", () => {
    const bare = `---\ntype: OEM Account\n---\n\n# Balt\n\n## Overview\n\nGrowth account.\n`;
    const { content, added } = addContactsToNote(bare, [{ name: "Luc Martin" }]);
    expect(added).toEqual(["Luc Martin"]);
    expect(content).toContain("## Key contacts");
    expect(content).toContain("- **Luc Martin**");
    const acc = parseAccount(content, "300 Merit/Customers/Balt.md");
    expect(acc.contacts.map((c) => c.name)).toContain("Luc Martin");
  });

  it("places bullets directly under a heading that has no bullets yet", () => {
    const empty = `# Acme\n\n## Key contacts\n\n## Links\n\n- [[x]]\n`;
    const { content } = addContactsToNote(empty, [{ name: "Jo Kim" }]);
    const lines = content.split("\n");
    const h = lines.findIndex((l) => /## Key contacts/.test(l));
    expect(lines[h + 1]).toBe("- **Jo Kim**");
  });
});

describe("normName", () => {
  it("normalizes punctuation, markdown, and parentheticals", () => {
    expect(normName("**Dr. Amy Lee**")).toBe("dramylee");
    expect(normName("Boston Scientific (BSC)")).toBe("bostonscientific");
    expect(normName("[[Sam Okoro]]")).toBe("samokoro");
  });
});
