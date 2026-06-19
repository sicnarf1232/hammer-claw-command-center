import { describe, it, expect } from "vitest";
import { customerContacts } from "./accounts";
import { parseRoster } from "./vault/roster";
import type { AccountContact } from "./vault/types";

// Roster: Nick + Amy are Merit (Leadership / Merit Internal People); the rest
// are unknown to the roster (treated as external/customer).
const ROSTER = parseRoster(`
## Leadership

- [[Amy Carter]]

## Merit Internal People

- [[Nick Patel]]

## Customer Contacts

- [[Iris Zetah]] ([[Boston Scientific]])
`);

const CONTACTS: AccountContact[] = [
  { name: "Iris Zetah", title: "Quality Lead", email: "iris@bsci.com" },
  { name: "Nick Patel", title: "Merit AE" }, // roster-classified merit, misfiled
  { name: "Amy Carter" }, // Merit leadership, misfiled
  { name: "Dave Internal", email: "dave@merit.com" }, // not in roster, merit email
  { name: "Priya Shah", email: "priya@example.com" }, // unknown external
];

describe("customerContacts", () => {
  it("drops Merit teammates (roster or merit email), keeps external people", () => {
    const out = customerContacts(CONTACTS, ROSTER).map((c) => c.name);
    expect(out).toEqual(["Iris Zetah", "Priya Shah"]);
  });

  it("still drops merit-email contacts when the roster is empty", () => {
    const out = customerContacts(CONTACTS, new Map()).map((c) => c.name);
    expect(out).not.toContain("Dave Internal");
    expect(out).toContain("Iris Zetah");
  });
});
