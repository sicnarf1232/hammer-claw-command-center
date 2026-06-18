import { describe, it, expect } from "vitest";
import {
  applyAccountEdit,
  accountToEditable,
  serializeContact,
} from "./accountEdit";
import { parseAccount } from "./vault/accounts";

const NOTE = `---
name: Boston Scientific
status: new
account_number: "10042"
workstream: merit
type: customer
created: 2026-05-13
---

# Boston Scientific (BSC)

## Overview
Major medical device customer.

## Active situations

### PO8358476 — cert correction
- Iris flagged it.

## Key contacts
- **Iris Zetah** — Quality Lead · iris.zetah@bsci.com · (555) 200-1000

## Links
- [[Atlas CRM]]
`;

function reparse(content: string) {
  return parseAccount(content, "300 Merit/Customers/Boston Scientific.md");
}

describe("contact parse + serialize round trip", () => {
  it("parses title, email, and phone, and serializes back", () => {
    const a = reparse(NOTE);
    const iris = a.contacts.find((c) => c.name === "Iris Zetah")!;
    expect(iris.title).toBe("Quality Lead");
    expect(iris.email).toBe("iris.zetah@bsci.com");
    expect(iris.phone).toBe("(555) 200-1000");
    expect(serializeContact(iris)).toBe(
      "- **Iris Zetah** — Quality Lead · iris.zetah@bsci.com · (555) 200-1000",
    );
  });
});

describe("applyAccountEdit", () => {
  it("round-trips with no changes (structure preserved)", () => {
    const edit = accountToEditable(reparse(NOTE));
    const out = applyAccountEdit(NOTE, edit);
    const a = reparse(out);
    expect(a.name).toBe("Boston Scientific");
    expect(a.contacts.map((c) => c.name)).toEqual(["Iris Zetah"]);
    expect(out).toContain("## Active situations"); // untouched section preserved
    expect(out).toContain("[[Atlas CRM]]");
  });

  it("edits frontmatter fields and the overview", () => {
    const edit = accountToEditable(reparse(NOTE));
    edit.region = "Pacific OEM";
    edit.stage = "Growth";
    edit.status = "active";
    edit.accountNumber = "99999";
    edit.overview = "Strategic OEM account, expanding in 2026.";
    const out = applyAccountEdit(NOTE, edit);
    const a = reparse(out);
    expect(a.region).toBe("Pacific OEM");
    expect(a.stage).toBe("Growth");
    expect(a.status).toBe("active");
    expect(a.accountNumber).toBe("99999");
    expect(a.overview).toContain("expanding in 2026");
  });

  it("adds, edits, and removes contacts (with title/email/phone)", () => {
    const edit = accountToEditable(reparse(NOTE));
    edit.contacts = [
      { name: "Iris Zetah", title: "VP Quality", email: "iris.zetah@bsci.com" },
      { name: "Sam Okoro", title: "Buyer", phone: "555-321-0000" },
    ];
    const out = applyAccountEdit(NOTE, edit);
    const a = reparse(out);
    const byName = Object.fromEntries(a.contacts.map((c) => [c.name, c]));
    expect(Object.keys(byName).sort()).toEqual(["Iris Zetah", "Sam Okoro"]);
    expect(byName["Iris Zetah"].title).toBe("VP Quality");
    expect(byName["Iris Zetah"].phone).toBeUndefined(); // phone removed
    expect(byName["Sam Okoro"].phone).toBe("555-321-0000");
  });

  it("creates a contacts section when the note has none", () => {
    const bare = `---\ntype: OEM Account\n---\n\n# Balt\n\n## Overview\nGrowth account.\n`;
    const edit = accountToEditable(reparse(bare));
    edit.contacts = [{ name: "Luc Martin", title: "Engineer" }];
    const out = applyAccountEdit(bare, edit);
    expect(out).toContain("## Key contacts");
    expect(reparse(out).contacts.map((c) => c.name)).toContain("Luc Martin");
  });
});
