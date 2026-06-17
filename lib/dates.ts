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

// A meeting action item "needs a due date" when the due is missing, the TBD
// placeholder, or a vague/non-ISO value (a range or a phrase like "this week"
// or "EOW"). This is the Phase-A flag condition, shared by the read-only
// meeting view and the Phase-C editor.
export function needsDueDate(due: string | undefined): boolean {
  const v = (due ?? "").trim();
  if (!v || v.toLowerCase() === "tbd") return true;
  return !isISODate(v);
}
