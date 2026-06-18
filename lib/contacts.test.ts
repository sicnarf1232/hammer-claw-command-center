import { describe, it, expect } from "vitest";
import { resolveAttendees } from "./contacts";
import { parseRoster } from "./vault/roster";

// Roster: Jordan + Nick are Merit; Amy + Sam are customer contacts on Intuitive.
const ROSTER = parseRoster(`
## Leadership

- [[Jordan Francis]]

## Merit Internal People

- [[Nick Patel]]

## Customer Contacts

- [[Amy Lee]] ([[Intuitive Surgical]])
- [[Sam Okoro]] ([[Intuitive Surgical]])
`);

describe("resolveAttendees", () => {
  it("creates external/unknown attendees, not Merit people, the user, or existing contacts", () => {
    const res = resolveAttendees(
      ["Jordan Francis", "Nick Patel", "Amy Lee", "Priya Shah", "Sam Okoro"],
      ["Amy Lee"], // already a contact on the account note
      ROSTER,
    );
    const byName = Object.fromEntries(res.map((r) => [r.name, r]));

    expect(byName["Jordan Francis"].willCreate).toBe(false); // self / merit
    expect(byName["Nick Patel"].willCreate).toBe(false); // merit, team not contact
    expect(byName["Amy Lee"].willCreate).toBe(false); // already a contact
    expect(byName["Amy Lee"].alreadyContact).toBe(true);
    expect(byName["Priya Shah"].willCreate).toBe(true); // unknown external
    expect(byName["Priya Shah"].classification).toBe("unknown");
    expect(byName["Sam Okoro"].willCreate).toBe(true); // customer, not yet on note
    expect(byName["Sam Okoro"].classification).toBe("customer");
  });

  it("dedupes attendees by normalized name", () => {
    const res = resolveAttendees(["Priya Shah", "priya  shah"], [], ROSTER);
    expect(res).toHaveLength(1);
  });

  it("treats account contacts case/space-insensitively", () => {
    const res = resolveAttendees(["amy   lee"], ["Amy Lee"], ROSTER);
    expect(res[0].alreadyContact).toBe(true);
    expect(res[0].willCreate).toBe(false);
  });
});
