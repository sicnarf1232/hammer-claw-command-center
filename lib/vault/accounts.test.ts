import { describe, it, expect } from "vitest";
import { parseAccount, slugify } from "./accounts";

const BSC = `---
name: Boston Scientific
kind: customer
status: new
account_number: "10042"
workstream: merit
type: customer
created: 2026-05-13
---

# Boston Scientific (BSC)

## Overview
Major medical device customer with broad Merit relationship.

## Active situations

### PO8358476 — cert correction needed (4/24/26)
- Iris Zetah (BSC) flagged certificate correction.

## Key contacts
- **Iris Zetah** — Boston Scientific. iris.zetah@bsci.com.
- **Hilary Strain** — print update handler.

## Links
- [[Atlas CRM]]
- [[memory/people/Nick Francis|Nick Francis]]
`;

const NONUM = `---
type: OEM Account
region: Pacific OEM
workstream: merit
status: active
created: 2026-05-12
---
# Medtronic
**Type:** OEM Account

## Active Situations
- **MiniMed Syringe Kit Build** — Delivery slipped from May 15 to May 25.
- **BSI/TUV Compliance** — 2 BSI items open.
`;

describe("parseAccount", () => {
  it("parses frontmatter, account number, situations, contacts, links", () => {
    const a = parseAccount(BSC, "300 Merit/Customers/Boston Scientific.md");
    expect(a.name).toBe("Boston Scientific");
    expect(a.slug).toBe("boston-scientific");
    expect(a.accountNumber).toBe("10042");
    expect(a.workstream).toBe("merit");
    expect(a.overview).toContain("Major medical device customer");
    expect(a.contacts.map((c) => c.name)).toContain("Iris Zetah");
    expect(a.contacts.find((c) => c.name === "Iris Zetah")?.email).toBe(
      "iris.zetah@bsci.com",
    );
    expect(a.links).toContain("Atlas CRM");
    expect(a.links).toContain("Nick Francis");
  });

  it("derives name from heading and tolerates a missing account number", () => {
    const a = parseAccount(NONUM, "300 Merit/Customers/Medtronic.md");
    expect(a.name).toBe("Medtronic");
    expect(a.region).toBe("Pacific OEM");
    expect(a.accountNumber).toBeUndefined();
    expect(a.situations).toEqual([
      "MiniMed Syringe Kit Build",
      "BSI/TUV Compliance",
    ]);
  });
});

describe("slugify", () => {
  it("handles ampersands, apostrophes, and spaces", () => {
    expect(slugify("Johnson & Johnson DOO")).toBe("johnson-and-johnson-doo");
    expect(slugify("Q'Apel Medical")).toBe("qapel-medical");
  });
});
