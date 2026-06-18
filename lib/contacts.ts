import type { Roster } from "@/lib/vault/types";
import { classifyName } from "@/lib/vault/roster";
import { normName } from "@/lib/contactsWrite";

// Phase B: resolve a meeting's attendees against an account's existing contacts
// and the roster, deciding which ones to auto-create as customer contacts.
// Pure (the roster + account contacts are passed in), so it is unit-tested.
// Classification is shared with Phase A's owner logic (the roster) so contacts
// and task ownership stay consistent.

export type AttendeeClass = "merit" | "customer" | "unknown";

export interface AttendeeResolution {
  name: string;
  classification: AttendeeClass;
  alreadyContact: boolean; // already listed on the account note
  willCreate: boolean; // a new customer/external contact to add
}

// Names that are the app's own user; never filed as a customer contact.
const SELF = new Set(["jordan", "jordanfrancis"]);

export function resolveAttendees(
  attendees: string[],
  accountContactNames: string[],
  roster: Roster,
): AttendeeResolution[] {
  const existing = new Set(accountContactNames.map(normName));
  const seen = new Set<string>();
  const out: AttendeeResolution[] = [];
  for (const raw of attendees) {
    const name = raw.trim();
    const key = normName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const classification: AttendeeClass =
      classifyName(roster, name)?.classification ?? "unknown";
    const alreadyContact = existing.has(key);
    // Create a contact for any external attendee (customer or unknown) of a
    // customer meeting; never for Merit-internal people or the user. Merit
    // attendees are team, not account contacts.
    const willCreate =
      !alreadyContact && classification !== "merit" && !SELF.has(key);
    out.push({ name, classification, alreadyContact, willCreate });
  }
  return out;
}
