// Pure logic for correcting a sender's display name (dev-feedback #17):
// "Mvanega3" showing up as a contact's name because Outlook never had a real
// display name on file for that address, and the app stored the mailbox
// alias verbatim with no sanity check.

// Loose sanity check, not full RFC 5322: one "@", something on both sides,
// a dot in the domain, no whitespace. Good enough to reject obvious garbage
// without rejecting a real but unusual address.
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleEmail(value: string): boolean {
  return PLAUSIBLE_EMAIL.test(value.trim());
}

export interface SetNameValue {
  email: string; // trimmed, lowercased
  fullName: string; // trimmed
}

export type SetNameResult =
  | { ok: true; value: SetNameValue }
  | { ok: false; error: string };

// Validate a POST /api/people/set-name body before it touches the DB.
export function validateSetName(input: {
  email: unknown;
  fullName: unknown;
}): SetNameResult {
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  if (!email || !isPlausibleEmail(email)) {
    return { ok: false, error: "A valid email address is required." };
  }
  if (!fullName) {
    return { ok: false, error: "A name is required." };
  }
  if (fullName.length > 200) {
    return { ok: false, error: "Name is too long." };
  }
  return { ok: true, value: { email: email.toLowerCase(), fullName } };
}

// dev-feedback #17 part 4 (source heuristic, display-only): a captured
// fromName is likely a raw mailbox alias rather than a real display name
// when it's a single token (no space) containing a digit, e.g. "Mvanega3":
// a genuine "First Last" name is never a single digit-bearing token.
//
// Digit is a REQUIRED signal, not just a nice-to-have: matching the email's
// local part alone (with no digit) is not enough, because a genuinely
// single-word or foreign name (e.g. "Cher", "Bjork") legitimately equals its
// own mailbox local part and must never be suppressed. Requiring a digit
// keeps this rule firing only on the shape the bug report showed, never on a
// real name that just happens to lack a space. Only used as a tiebreaker
// when there is no people-row card for the address; a matched card's
// fullName always wins regardless.
export function looksLikeMailboxAlias(fromName: string): boolean {
  const name = fromName.trim();
  if (!name || name.includes(" ")) return false;
  return /\d/.test(name);
}
