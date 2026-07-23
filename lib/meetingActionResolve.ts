import type { MeetingActionProposal, ActionReviewState } from "@/lib/proposals/types";

// Deterministic owner-candidate resolver for meeting actions (Slice C).
//
// PURE: no DB, no AI. The caller loads people once per pull and passes them in.
// Implements the People matching order from docs/decisions/meeting-linking-rules.md:
//
//   1. exact stable person id            (not available yet; skipped)
//   2. exact normalized email address
//   3. confirmed person alias
//   4. exact normalized full name, when only ONE active person matches
//   5. a single strong contextual match (first name + meeting attendance)
//   6. otherwise unresolved: candidates surface for review, nothing is guessed
//
// "First-name-only matching is never enough when more than one plausible person
// exists" -> multiple matches become `ambiguous` with ALL candidates listed.
// A team/function owner ("Operations", "Quality") is a `group`, not a person.
// The resolver only ever SUGGESTS: it never emits `assigned`; confirmation is
// Jordan's, in the review UI. Actions already `assigned` are left untouched.

export interface ResolvePerson {
  id: number;
  fullName: string;
  classification: string; // internal | customer | unknown
  accountId: number | null;
  email: string | null;
  aliases: string[];
  isSelf: boolean;
}

export interface ResolveContext {
  people: ResolvePerson[];
  attendees: string[]; // plain attendee names on the meeting (no titles)
}

// Function/team owners that are not individuals. Conservative, lowercase.
const TEAM_OWNERS = new Set([
  "operations", "ops", "quality", "engineering", "regulatory", "r&d", "rd",
  "field assurance", "customer service", "cs", "sales", "marketing", "team",
  "supply chain", "planning", "shipping", "receiving", "manufacturing",
]);

export function isTeamOwner(ownerText: string): boolean {
  return TEAM_OWNERS.has(ownerText.trim().toLowerCase());
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export interface OwnerResolution {
  candidatePersonIds: number[];
  reasons: string[];
  confidence: "high" | "medium" | "low" | "none";
  ownerReviewState: ActionReviewState;
}

export function resolveOwner(
  ownerText: string | null,
  isJordans: boolean,
  ctx: ResolveContext,
): OwnerResolution {
  // Jordan's own action: the self person is not a guess, but confirmation still
  // happens at review, so it surfaces as a suggestion, never auto-assigned.
  if (isJordans) {
    const self = ctx.people.filter((p) => p.isSelf);
    if (self.length === 1) {
      return {
        candidatePersonIds: [self[0].id],
        reasons: ["Jordan's own action item."],
        confidence: "high",
        ownerReviewState: "suggested",
      };
    }
  }

  if (!ownerText || !ownerText.trim()) {
    return { candidatePersonIds: [], reasons: [], confidence: "none", ownerReviewState: "unassigned" };
  }
  const owner = norm(ownerText);

  // Team/function owner: a review state of its own, never a person candidate.
  if (isTeamOwner(owner)) {
    return {
      candidatePersonIds: [],
      reasons: [`"${ownerText.trim()}" is a team or function, not an individual.`],
      confidence: "high",
      ownerReviewState: "group",
    };
  }

  // 2. Exact normalized email address.
  if (owner.includes("@")) {
    const byEmail = ctx.people.filter((p) => p.email && norm(p.email) === owner);
    if (byEmail.length === 1) {
      return {
        candidatePersonIds: [byEmail[0].id],
        reasons: ["Email address exactly matched a person."],
        confidence: "high",
        ownerReviewState: "suggested",
      };
    }
  }

  // 3. Confirmed alias. 4. Exact full name (single active match). Collected
  // together so a name that is BOTH someone's alias and someone else's full
  // name is correctly ambiguous instead of first-rule-wins.
  const byAlias = ctx.people.filter((p) => p.aliases.some((a) => norm(a) === owner));
  const byFullName = ctx.people.filter((p) => norm(p.fullName) === owner);
  const exact = dedupePeople([...byAlias, ...byFullName]);
  if (exact.length === 1) {
    const p = exact[0];
    const via = byAlias.some((a) => a.id === p.id)
      ? "Confirmed alias matched a person."
      : "Full name exactly matched one person.";
    return {
      candidatePersonIds: [p.id],
      reasons: [via],
      confidence: "high",
      ownerReviewState: "suggested",
    };
  }
  if (exact.length > 1) {
    return {
      candidatePersonIds: exact.map((p) => p.id),
      reasons: ["More than one person matches this name exactly."],
      confidence: "low",
      ownerReviewState: "ambiguous",
    };
  }

  // 5. Single strong contextual match: the owner is a first name; if exactly
  // one ATTENDEE's full name starts with it, and that attendee resolves to
  // exactly one person, meeting attendance disambiguates it.
  const attendeeHits = ctx.attendees.filter((a) => {
    const first = norm(a).split(" ")[0];
    return first === owner;
  });
  if (attendeeHits.length === 1) {
    const persons = ctx.people.filter((p) => norm(p.fullName) === norm(attendeeHits[0]));
    if (persons.length === 1) {
      return {
        candidatePersonIds: [persons[0].id],
        reasons: [
          "Named directly as the owner in the note.",
          `Matches attendee ${attendeeHits[0]} and no one else in the meeting.`,
        ],
        confidence: "medium",
        ownerReviewState: "suggested",
      };
    }
  }

  // 6. First-name candidates across all people: surface for review, never pick.
  const firstNameMatches = ctx.people.filter(
    (p) => norm(p.fullName).split(" ")[0] === owner,
  );
  if (firstNameMatches.length === 1) {
    // A single plausible person overall is still only a suggestion (weaker
    // evidence than an exact or attendance match).
    return {
      candidatePersonIds: [firstNameMatches[0].id],
      reasons: [`Only one known person is called ${ownerText.trim()}.`],
      confidence: "medium",
      ownerReviewState: "suggested",
    };
  }
  if (firstNameMatches.length > 1) {
    return {
      candidatePersonIds: firstNameMatches.map((p) => p.id),
      reasons: [`Several people are called ${ownerText.trim()}; needs your pick.`],
      confidence: "low",
      ownerReviewState: "ambiguous",
    };
  }

  return { candidatePersonIds: [], reasons: [], confidence: "none", ownerReviewState: "unassigned" };
}

function dedupePeople(list: ResolvePerson[]): ResolvePerson[] {
  const seen = new Set<number>();
  return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

// Apply the resolver across a contract's actions. Confirmed (`assigned`) and
// explicitly rejected actions are never touched: reprocessing must not
// overwrite a decision Jordan already made (linking-rules, Human corrections).
export function resolveActionOwners(
  actions: MeetingActionProposal[],
  ctx: ResolveContext,
): MeetingActionProposal[] {
  return actions.map((a) => {
    if (a.ownerReviewState === "assigned" || a.ownerReviewState === "rejected") return a;
    const r = resolveOwner(a.ownerText, a.isJordans, ctx);
    return {
      ...a,
      candidatePersonIds: r.candidatePersonIds,
      reasons: r.reasons,
      confidence: r.confidence,
      ownerReviewState: r.ownerReviewState,
    };
  });
}
