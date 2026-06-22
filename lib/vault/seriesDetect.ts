import { matchesSeries, type Series } from "./series";

// Detect recurring meetings that could become a rolling series. Works off the
// meetings index alone (cheap: title/date/bucket), so it runs on the list page
// without reading every note. The output feeds the "create a series" UI; the
// user always reviews and can rename before anything is written to the vault.

export interface DetectMeetingInput {
  date: string;
  bucket: string;
  title: string;
  noteBasename: string;
  notePath?: string | null;
}

export interface SeriesCandidate {
  key: string; // normalized signature the grouping is keyed on
  suggestedName: string; // a friendly name to pre-fill the create form
  isOneOnOne: boolean;
  count: number;
  firstDate: string;
  lastDate: string;
  buckets: string[]; // distinct buckets, for a workstream/folder hint
  meetings: DetectMeetingInput[]; // newest-first
}

// Cadence/format words and Jordan's own name that carry no identity for
// clustering. Removed so "Nick 1on1" and "Nick 1on1 (Pipeline Review)" key the
// same, and "Weekly Staff Sync" keys on "staff".
const STOPWORDS = new Set([
  "the", "a", "an", "with", "and", "of", "for", "to", "on",
  "jordan", "francis",
  "weekly", "biweekly", "bi", "monthly", "daily", "quarterly",
  "meeting", "mtg", "sync", "call", "catch", "catchup", "up",
  "checkin", "check", "in", "review", "prep", "notes", "note",
  "session", "standup", "stand", "1on1",
]);

const ONE_ON_ONE_RE = /\b1\s*[:\- ]?\s*1\b|1on1|one[\s-]?on[\s-]?one/i;

// Strip a leading ISO date and any trailing parentheticals, leaving the core
// title in its original casing (used to build a display name).
export function cleanMeetingTitle(title: string): string {
  let t = title.trim();
  t = t.replace(/^\d{4}-\d{2}-\d{2}\s*[-–—:]*\s*/, "");
  // Drop trailing "(...)" groups, possibly more than one.
  let prev: string;
  do {
    prev = t;
    t = t.replace(/\s*\([^)]*\)\s*$/, "").trim();
  } while (t !== prev);
  return t.trim();
}

// A normalization key: lowercase, 1:1 variants canonicalized, punctuation to
// spaces, stopwords dropped, remaining tokens sorted+unique. Falls back to the
// cleaned title when every token is a stopword (e.g. a bare "Weekly Sync").
export function titleKey(title: string): string {
  const cleaned = cleanMeetingTitle(title).toLowerCase();
  const canon = cleaned.replace(ONE_ON_ONE_RE, " ");
  const tokens = canon
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w));
  const significant = Array.from(new Set(tokens)).sort();
  if (significant.length === 0) {
    return cleaned.replace(/[^a-z0-9]+/g, " ").trim() || cleaned;
  }
  return significant.join(" ");
}

// Group meetings by title key, keep real recurrences (>= minCount meetings on
// >= 2 distinct dates), drop any group already covered by an existing series,
// and return newest-activity-first.
export function detectSeriesCandidates(
  meetings: DetectMeetingInput[],
  existing: Series[] = [],
  opts: { minCount?: number } = {},
): SeriesCandidate[] {
  const minCount = opts.minCount ?? 2;

  const groups = new Map<string, DetectMeetingInput[]>();
  for (const m of meetings) {
    if (!m.title?.trim()) continue;
    const key = titleKey(m.title);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }

  const candidates: SeriesCandidate[] = [];
  for (const [key, items] of groups) {
    const distinctDates = new Set(items.map((m) => m.date)).size;
    if (items.length < minCount || distinctDates < 2) continue;
    if (coveredByExistingSeries(items, existing)) continue;

    const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
    const buckets = Array.from(new Set(sorted.map((m) => m.bucket).filter(Boolean)));
    const isOneOnOne = sorted.some((m) => ONE_ON_ONE_RE.test(m.title));

    candidates.push({
      key,
      suggestedName: suggestName(sorted, isOneOnOne),
      isOneOnOne,
      count: sorted.length,
      firstDate: sorted[sorted.length - 1].date,
      lastDate: sorted[0].date,
      buckets,
      meetings: sorted,
    });
  }

  return candidates.sort(
    (a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate),
  );
}

// A group is already a series if any existing (non-archived) series matches a
// representative meeting's title, or shares the same normalized name key.
function coveredByExistingSeries(
  items: DetectMeetingInput[],
  existing: Series[],
): boolean {
  const active = existing.filter((s) => s.status?.toLowerCase() !== "archived");
  if (!active.length) return false;
  const groupKey = titleKey(items[0].title);
  for (const s of active) {
    if (titleKey(s.name) === groupKey) return true;
    const hit = items.some((m) =>
      matchesSeries(s, { title: m.title, attendees: [] }),
    );
    if (hit) return true;
  }
  return false;
}

// Pick a friendly name: the most common cleaned title in the group. For a 1:1,
// format it as "<Person> / Jordan 1:1" when a single other name is evident.
function suggestName(items: DetectMeetingInput[], isOneOnOne: boolean): string {
  const counts = new Map<string, number>();
  for (const m of items) {
    const c = cleanMeetingTitle(m.title);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = items[0].title;
  let bestN = -1;
  for (const [name, n] of counts) {
    if (n > bestN || (n === bestN && name.length < best.length)) {
      best = name;
      bestN = n;
    }
  }
  if (isOneOnOne) {
    const person = best.replace(ONE_ON_ONE_RE, "").replace(/[/]/g, " ").trim();
    if (person && !/jordan/i.test(person)) return `${person} / Jordan 1:1`;
  }
  return best;
}
