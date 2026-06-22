// Match a person to how they appear across the vault: attendees use full names
// ("Nick Francis"), action-item owners often use a first name ("Nick"), and the
// roster may use either. Pure + tested so the /people aggregation is reliable.

export function normalizePersonName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Does `candidate` (an attendee or owner string) refer to `person`? Exact match,
// or a first-name match when one side is a single token, or one fully contains
// the other. Conservative enough to avoid matching unrelated names.
export function personNameMatches(person: string, candidate: string): boolean {
  const a = normalizePersonName(person);
  const b = normalizePersonName(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  const at = a.split(" ");
  const bt = b.split(" ");
  // single-token side matches the other's first token ("Nick" ~ "Nick Francis")
  if (at.length === 1 && bt[0] === at[0]) return true;
  if (bt.length === 1 && at[0] === bt[0]) return true;
  // full containment ("nick francis" within "nick francis (merit)")
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}
