import { describe, it, expect } from "vitest";
import type { TriagedActionItem } from "./ai";
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
});

describe("action ownership is distinct from meeting attendance", () => {
  // Grounded in a real parsed meeting, not a hand-built attendee list. The note
  // is attended by Jordan and Nick (Merit) but its two actions are owned by
  // "Operations" (a team) and "Scott" (a person who did not attend). Attendee
  // resolution and action ownership are two different axes; these pin that the
  // current pipeline keeps action owners as bare strings and never reconciles
  // them against attendance. linking-rules models `group` ownership and
  // absent-owner review as separate states from attendee contact creation.
  const note = parseMeetingNote(NOTE_INTERNAL_ABOUT_CUSTOMER, "internal.md");
  const attendees = resolveAttendees(note.attendees, [], parseRoster(ROSTER_BASIC));
  const owners = note.actionItems.map((a) => a.owner);

  it("the meeting's attendees and its action owners are disjoint sets", () => {
    // Titles are stripped on parse, so attendees are the two Merit names.
    expect(attendees.map((a) => a.name)).toEqual(["Jordan Francis", "Nick Patel"]);
    // Neither action owner attended, so neither can be resolved via attendance.
    expect(owners).toEqual(["Operations", "Scott"]);
    for (const owner of owners) {
      expect(attendees.map((a) => a.name)).not.toContain(owner);
    }
  });

  it("a team owner (Operations) stays a plain string with no person identity", () => {
    // A team/function owner is not an individual. It survives only as the owner
    // string on the action item; there is no ownerPersonId and no roster lookup.
    // linking-rules models this as a distinct `group` ownership state.
    const opsAction = note.actionItems.find((a) => a.owner === "Operations");
    expect(opsAction).toBeDefined();
    expect(opsAction).not.toHaveProperty("ownerPersonId");
    expect(classifyName(parseRoster(ROSTER_BASIC), "Operations")).toBeUndefined();
    // TODO Slice C/D: team owners must resolve to a `group` state, not be
    // conflated with an unknown person or proposed as an account contact.
  });

  it("an action owner absent from attendance is never fabricated as an attendee", () => {
    // "Scott" owns an action but did not attend; attendee resolution only sees
    // the names on the attendee line, so it cannot surface Scott at all.
    expect(attendees.map((a) => a.name)).not.toContain("Scott");
    // TODO Slice E: an absent action owner must enter review, not silently drop.
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
  // plan gap 7: both the deterministic template path and the AI path end with an
  // owner string and no identity resolution. Both contracts are exercised here.

  it("the template path yields only an owner STRING, no person id", () => {
    expect(matchesNoteTemplate(NOTE_TEMPLATED_PASSTHROUGH)).toBe(true);
    const parsed = parseTemplatedNote(NOTE_TEMPLATED_PASSTHROUGH);
    const triaged = triagedFromTemplate(parsed, {
      fallbackTitle: "Intuitive weekly",
      attendees: [],
      knownAccounts: ["Intuitive Surgical"],
      date: "2026-07-20",
    });
    expect(triaged.actionItems.length).toBeGreaterThan(0);
    for (const item of triaged.actionItems) {
      expect(typeof item.owner === "string" || item.owner === null).toBe(true);
      expect(item).not.toHaveProperty("ownerPersonId");
    }
    // TODO Slice B/D: after either extraction path, deterministic identity
    // resolution must run so owners become candidate person ids for review.
  });

  it("the AI path's action contract carries the same owner-string-only shape", () => {
    // The AI path (lib/ai.ts triageMeeting) returns TriagedActionItem objects.
    // Its owner field is `string | null` and the interface has no ownerPersonId,
    // so an approved AI proposal reaches the writer with an owner string and no
    // identity, exactly like the template path above. Inert data typed to the
    // real interface: if lib/ai.ts ever adds ownerPersonId, this stops compiling
    // and the characterization must be revisited.
    const aiActions: TriagedActionItem[] = [
      { owner: "Jordan", text: "Send the updated Q3 forecast.", isJordans: true },
      { owner: "Amy", text: "Confirm the revised GTIN list.", isJordans: false },
      { owner: null, text: "Circulate the CAPA summary.", isJordans: false },
    ];
    for (const item of aiActions) {
      expect(typeof item.owner === "string" || item.owner === null).toBe(true);
      expect(item).not.toHaveProperty("ownerPersonId");
    }
    // TODO Slice B/D: same as the template path. Identity resolution must run on
    // AI-produced owners before an approved proposal is written.
  });
});
