// Date helpers. The vault uses ISO YYYY-MM-DD and Mountain Time. We compute
// "today" in the app timezone (default America/Denver) so due-today / overdue
// match what Jordan sees in Obsidian, regardless of where the server runs.

const TZ = process.env.APP_TIMEZONE ?? "America/Denver";

// Today's date as YYYY-MM-DD in the app timezone.
export function todayISO(now: Date = new Date()): string {
  // en-CA gives ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Compare two YYYY-MM-DD strings. Lexicographic order is correct for ISO dates.
export function isOnOrBefore(date: string, ref: string): boolean {
  return date <= ref;
}

export function isBefore(date: string, ref: string): boolean {
  return date < ref;
}

// A valid YYYY-MM-DD?
export function isISODate(v: string | undefined): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function appTimezone(): string {
  return TZ;
}

// Wall-clock parts in the app timezone. Because TZ is an IANA zone name and not
// a fixed offset, this follows DST automatically: no schedule drifts an hour in
// November, and moving APP_TIMEZONE to any other zone relocates every job.
export function localParts(now: Date = new Date()): {
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: Math.max(0, days.indexOf(get("weekday"))),
  };
}

// Should an hourly cron actually do its work on this invocation? Vercel cron
// schedules are UTC-only with no timezone field, so the jobs run every hour and
// each one gates itself on the local hour (and weekday, for weekly jobs) here.
export function isLocalRunTime(
  hour: number,
  opts: { weekday?: number } = {},
  now: Date = new Date(),
): boolean {
  const p = localParts(now);
  if (p.hour !== hour) return false;
  if (opts.weekday !== undefined && p.weekday !== opts.weekday) return false;
  return true;
}

// A meeting action item "needs a due date" when the due is missing, the TBD
// placeholder, or a vague/non-ISO value (a range or a phrase like "this week"
// or "EOW"). This is the Phase-A flag condition, shared by the read-only
// meeting view and the Phase-C editor.
export function needsDueDate(due: string | undefined): boolean {
  const v = (due ?? "").trim();
  if (!v || v.toLowerCase() === "tbd") return true;
  return !isISODate(v);
}
