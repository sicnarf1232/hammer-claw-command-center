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
  { name: "Iris Zetah", title: "Quality Lead" },
  { name: "Nick Patel", title: "Merit AE" }, // Merit teammate, misfiled
  { name: "Amy Carter" }, // Merit leadership, misfiled
  { name: "Priya Shah" }, // unknown external
];

describe("customerContacts", () => {
  it("drops Merit teammates, keeps customer and unknown people", () => {
    const out = customerContacts(CONTACTS, ROSTER).map((c) => c.name);
    expect(out).toEqual(["Iris Zetah", "Priya Shah"]);
  });

  it("returns everyone when the roster is empty", () => {
    const out = customerContacts(CONTACTS, new Map());
    expect(out).toHaveLength(4);
  });
});
