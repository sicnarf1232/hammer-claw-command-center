// Pure helpers for deriving series fields from selected past meetings. The
// deterministic parts live here (testable, no AI); lib/ai.ts deriveSeriesRules
// feeds the cadence inference to the model as a hint.

export type SeriesCadence = "weekly" | "biweekly" | "monthly" | "ad hoc";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

// Infer a cadence from meeting dates by median gap between consecutive
// meetings. Needs 3+ distinct dated meetings (2+ gaps) to say anything;
// returns null otherwise so the caller can leave the field open.
export function inferCadenceFromDates(
  dates: Array<string | null | undefined>,
): SeriesCadence | null {
  const times = Array.from(
    new Set(dates.filter((d): d is string => !!d && ISO_DATE.test(d))),
  )
    .map((d) => new Date(`${d}T12:00:00Z`).getTime())
    .sort((a, b) => a - b);
  if (times.length < 3) return null;

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push((times[i] - times[i - 1]) / DAY_MS);
  }
  gaps.sort((a, b) => a - b);
  const mid = gaps.length / 2;
  const median =
    gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2;

  if (median <= 10) return "weekly";
  if (median <= 21) return "biweekly";
  if (median <= 45) return "monthly";
  return "ad hoc";
}
