// Pick the best real person for a name the AI extracted from a task's text
// (dev-feedback #21's smart suggested-action feature: "draft email to Mike"
// needs a real address, not just the name "Mike"). Kept pure and DB-free so
// it is testable without a database: lib/peopleSearch.ts's searchPeople does
// the ilike DB lookup and hands back candidates, this only picks among them.
// Never guesses among several plausible people; a miss just leaves the
// recipient blank for Jordan to fill in himself (see the API route).

export interface RecipientCandidate {
  id: number;
  name: string;
  email: string | null;
}

export function pickBestPersonMatch<T extends RecipientCandidate>(
  name: string,
  candidates: T[],
): T | null {
  const needle = name.trim().toLowerCase();
  if (!needle || !candidates.length) return null;

  // Each tier only commits when it narrows to exactly one candidate; two or
  // more equally plausible people (two "Mike"s) is a guess, not a match, so
  // it falls through rather than picking arbitrarily.
  const exact = candidates.filter((c) => c.name.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  // The AI usually extracts just a first name (e.g. "Mike" from "Mike
  // Blackham"), so match on the candidate's first name too.
  const firstName = candidates.filter(
    (c) => c.name.trim().toLowerCase().split(/\s+/)[0] === needle,
  );
  if (firstName.length === 1) return firstName[0];
  if (firstName.length > 1) return null;

  const partial = candidates.filter(
    (c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase()),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) return null;

  // A single unmatched candidate from a name-filtered search is still a
  // reasonable pick.
  return candidates.length === 1 ? candidates[0] : null;
}
