import { describe, it, expect } from "vitest";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { people as peopleT } from "@/lib/db/schema";
import { activeResolvePeople, activePersonIdsPredicate } from "./peopleDb";
import { resolveOwner } from "./meetingActionResolve";

// Codex round 1 finding 1: superseded identities must never take part in
// deterministic matching, candidate lists, or the review dropdown. The pure
// mapper behind listPeopleForResolve() filters them; these tests characterize
// that a superseded Scott creates no false ambiguity and cannot be a candidate.

const ROW = (
  id: number,
  fullName: string,
  supersededBy: number | null,
  over: Partial<Parameters<typeof activeResolvePeople>[0][number]> = {},
) => ({
  id,
  fullName,
  classification: "internal",
  accountId: null,
  email: null,
  isSelf: false,
  supersededBy,
  ...over,
});

describe("activeResolvePeople", () => {
  it("filters superseded people and their aliases", () => {
    const out = activeResolvePeople(
      [ROW(1, "Scott Reyes", null), ROW(2, "Scott Palmer", 1)],
      [
        { personId: 1, alias: "Scotty" },
        { personId: 2, alias: "SP" },
      ],
    );
    expect(out.map((p) => p.id)).toEqual([1]);
    expect(out[0].aliases).toEqual(["Scotty"]);
  });

  it("a superseded Scott cannot create false ambiguity in the resolver", () => {
    const people = activeResolvePeople(
      [ROW(1, "Scott Reyes", null), ROW(2, "Scott Palmer", 1)],
      [],
    );
    const r = resolveOwner("Scott", false, { people, attendees: [] });
    // One ACTIVE Scott: a suggestion, not ambiguous, and the superseded id
    // never appears among the candidates.
    expect(r.ownerReviewState).toBe("suggested");
    expect(r.candidatePersonIds).toEqual([1]);
    expect(r.candidatePersonIds).not.toContain(2);
  });

  it("two ACTIVE Scotts still stay ambiguous (the filter removes only superseded rows)", () => {
    const people = activeResolvePeople(
      [ROW(1, "Scott Reyes", null), ROW(2, "Scott Palmer", null)],
      [],
    );
    const r = resolveOwner("Scott", false, { people, attendees: [] });
    expect(r.ownerReviewState).toBe("ambiguous");
    expect(r.candidatePersonIds.sort()).toEqual([1, 2]);
  });

  it("a superseded exact-full-name match resolves to nothing rather than the dead identity", () => {
    const people = activeResolvePeople([ROW(2, "Scott Palmer", 1)], []);
    const r = resolveOwner("Scott Palmer", false, { people, attendees: [] });
    expect(r.ownerReviewState).toBe("unassigned");
    expect(r.candidatePersonIds).toEqual([]);
  });
});

describe("activePersonIdsPredicate: hotfix query generation", () => {
  // Production failure: `${peopleT.id} = any(${ids})` bound a JS array in a
  // way the neon HTTP driver does not pass as a Postgres array ("op ANY/ALL
  // (array) requires array on right side"). The predicate now uses Drizzle's
  // inArray; these checks prove multiple ids render as a plain IN (...) list
  // with one placeholder per id, while the active-person requirement
  // (superseded_by IS NULL) is retained.
  it("multiple ids produce a valid IN (...) query with per-id params", () => {
    const qb = new QueryBuilder();
    const { sql: text, params } = qb
      .select({ id: peopleT.id })
      .from(peopleT)
      .where(activePersonIdsPredicate([1, 2, 3]))
      .toSQL();
    expect(text).toMatch(/"id" in \(\$1, \$2, \$3\)/i);
    expect(text).not.toMatch(/any\s*\(/i); // the failing construct is gone
    expect(text).toMatch(/"superseded_by" is null/i); // validation not weakened
    expect(params).toEqual([1, 2, 3]);
  });

  it("a single id still renders as IN with one param", () => {
    const qb = new QueryBuilder();
    const { sql: text, params } = qb
      .select({ id: peopleT.id })
      .from(peopleT)
      .where(activePersonIdsPredicate([42]))
      .toSQL();
    expect(text).toMatch(/"id" in \(\$1\)/i);
    expect(params).toEqual([42]);
  });
});
