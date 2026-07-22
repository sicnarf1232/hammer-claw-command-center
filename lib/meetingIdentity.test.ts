import { describe, it, expect } from "vitest";
import { parseRoster, classifyName } from "./vault/roster";
import { resolveAttendees } from "./contacts";
import { parseMeetingNote } from "./vault/meetings";
import {
  matchesNoteTemplate,
  parseTemplatedNote,
  triagedFromTemplate,
} from "./noteTemplate";
import {
  ROSTER_TWO_SCOTTS,
  ROSTER_COLLIDING_SCOTTS,
  ROSTER_BASIC,
  NOTE_INTERNAL_ABOUT_CUSTOMER,
  NOTE_TEMPLATED_PASSTHROUGH,
} from "./__fixtures__/meetingActions";

// Slice A characterization of identity resolution for meeting attendees and
// action owners. Pure: everything runs through the real roster/attendee/note
// parsers with fixture data. These pin the current behavior the linking rules
// (docs/decisions/meeting-linking-rules.md) mean to correct in Slices B-E.
// resolveAttendees already has base coverage in contacts.test.ts; this is a
// sibling focused on the risk scenarios, not a duplicate of that file.

describe("duplicate first names (two active people named Scott)", () => {
  const roster = parseRoster(ROSTER_TWO_SCOTTS);

  it("resolves each Scott only by full name", () => {
    expect(classifyName(roster, "Scott Reyes")?.classification).toBe("merit");
    expect(classifyName(roster, "Scott Palmer")?.classification).toBe("customer");
  });

  it("a first-name-only owner 'Scott' resolves to NEITHER person", () => {
    // An action written "Scott: ..." carries only the first name. With two
    // active Scotts this is ambiguous, and the roster (keyed by full name)
    // returns no match rather than guessing. linking-rules: "First-name-only
    // matching is never enough when more than one plausible person exists."
    expect(classifyName(roster, "Scott")).toBeUndefined();
  });
});

describe("ambiguous identity: two people share the literal same name", () => {
  it("the roster Map silently collapses colliding names to one entry", () => {
    // KNOWN RISK. The roster is a Map keyed by exact name. Two active people
    // both recorded as "Scott" (one Merit, one customer) cannot coexist; the
    // last one written wins and the other becomes invisible. A confident but
    // possibly wrong classification is returned with no ambiguity signal, which
    // AGENTS.md forbids ("Never silently choose between plausible people").
    const roster = parseRoster(ROSTER_COLLIDING_SCOTTS);
    expect([...roster.keys()]).toEqual(["Scott"]);
    expect(classifyName(roster, "Scott")?.classification).toBe("customer");
    // TODO Slice E: colliding identities must remain distinct and enter review
    // rather than collapsing onto a single roster key.
  });
});

describe("attendee/contact resolution risks", () => {
  const roster = parseRoster(ROSTER_BASIC);

  it("an unknown external attendee is proposed as a new customer contact", () => {
    // KNOWN RISK (plan gap 5). Any non-Merit attendee, including an unrecognized
    // name, is marked willCreate for a customer meeting, so a guest or vendor
    // can be added to the account unless Jordan catches it.
    const res = resolveAttendees(["Priya Vendor"], [], roster);
    expect(res[0].classification).toBe("unknown");
    expect(res[0].willCreate).toBe(true);
    // TODO Slice C/D: unknown external identities must stay unassigned and enter
    // review, never auto-proposed as an account contact.
  });

  it("a team/function owner such as Operations is treated as an unknown person", () => {
    // A team owner is not an individual and has no person identity, yet it
    // classifies as "unknown" and would be proposed as a contact just like a
    // person. linking-rules models this as a distinct `group` ownership state.
    const res = resolveAttendees(["Operations"], [], roster);
    expect(res[0].classification).toBe("unknown");
    expect(res[0].willCreate).toBe(true);
  });

  it("an owner named in an action but absent from attendees is never resolved from attendance", () => {
    // "Nick Patel" owns nothing in the attendee list here; attendee resolution
    // only ever sees the attendee names it is given, so an action owner who did
    // not attend cannot be resolved through this path.
    const res = resolveAttendees(["Jordan Francis", "Amy Lee"], [], roster);
    expect(res.map((r) => r.name)).not.toContain("Nick Patel");
  });
});

describe("internal meeting concerning a customer account", () => {
  const note = parseMeetingNote(NOTE_INTERNAL_ABOUT_CUSTOMER, "internal.md");

  it("is internal (no customer) yet records the account it is about", () => {
    // The meeting has no `customer:` link, so it is internal, but it is ABOUT
    // Intuitive via the related-accounts marker. plan gap 4: structured
    // action-level account decisions are not persisted from this today.
    expect(note.customer).toBeUndefined();
    expect(note.relatedAccounts).toContain("Intuitive Surgical");
  });

  it("its action owners are a team and an ambiguous first name, neither a person id", () => {
    expect(note.actionItems.map((a) => a.owner)).toEqual(["Operations", "Scott"]);
  });
});

describe("template passthrough vs AI-shaped proposal produce the same shallow owner", () => {
  it("a templated note skips AI yet yields only an owner STRING, no person id", () => {
    // plan gap 7: both the deterministic template path and the AI path end with
    // an owner string and no identity resolution. This asserts the template
    // path's shape; the AI path (lib/ai.ts TriagedActionItem) has the same
    // `owner: string | null` field and likewise no ownerPersonId.
    expect(matchesNoteTemplate(NOTE_TEMPLATED_PASSTHROUGH)).toBe(true);
    const parsed = parseTemplatedNote(NOTE_TEMPLATED_PASSTHROUGH);
    const triaged = triagedFromTemplate(parsed, {
      fallbackTitle: "Intuitive weekly",
      attendees: [],
      knownAccounts: ["Intuitive Surgical"],
      date: "2026-07-20",
    });
    for (const item of triaged.actionItems) {
      expect(typeof item.owner === "string" || item.owner === null).toBe(true);
      expect(item).not.toHaveProperty("ownerPersonId");
    }
    // TODO Slice B/D: after either extraction path, deterministic identity
    // resolution must run so owners become candidate person ids for review.
  });
});
