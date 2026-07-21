import { todayISO, formatDateMDY } from "@/lib/dates";

// Grouping and counting for the /notifications activity feed (dev-feedback
// #20 Part A): turns a flat, newest-first notification list into day buckets
// with a friendly Today/Yesterday label, so the page reads like a feed
// instead of one long log. Pure and unit tested; the page just renders it.

export interface DayGroup<T> {
  dayKey: string; // YYYY-MM-DD in the app timezone, or "unknown"
  label: string;
  rows: T[];
}

// Rows must already be sorted (newest first is the convention here); grouping
// preserves order and never resorts.
export function groupByDay<T>(
  rows: T[],
  createdAtOf: (row: T) => unknown,
  today: string = todayISO(),
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const byKey = new Map<string, DayGroup<T>>();

  for (const row of rows) {
    const raw = createdAtOf(row);
    const d = raw != null ? new Date(raw as string | number | Date) : null;
    const dayKey = d && !Number.isNaN(d.getTime()) ? todayISO(d) : "unknown";
    let group = byKey.get(dayKey);
    if (!group) {
      group = { dayKey, label: dayLabel(dayKey, today), rows: [] };
      byKey.set(dayKey, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

function dayLabel(dayKey: string, today: string): string {
  if (dayKey === "unknown") return "Unknown date";
  if (dayKey === today) return "Today";
  if (dayKey === shiftISODate(today, -1)) return "Yesterday";
  return formatDateMDY(dayKey);
}

// Shift a YYYY-MM-DD calendar date by N days. Pure date math on the calendar
// value itself (via a UTC-anchored Date), not a wall-clock instant, so it
// never drifts a day from a timezone conversion.
function shiftISODate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

// Count rows by kind, for the same-day "X due today, Y flagged" summary strip.
export function countByKind<T>(rows: T[], kindOf: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const k = kindOf(row);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}
