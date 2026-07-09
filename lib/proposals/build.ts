// Pure helpers for staging proposals: dedupe keys, payload summaries, the
// stage decision matrix, and a stable JSON encoding for change detection.
// No I/O here; everything is unit-tested.

import type { MeetingFilePayload, SeriesUpdatePayload } from "./types";

export function meetingDedupeKey(granolaId: string): string {
  return `granola:${granolaId}`;
}

export function seriesDedupeKey(seriesPath: string, meetingBasename: string): string {
  return `series:${seriesPath}:${meetingBasename}`;
}

export function meetingSummaryLine(p: MeetingFilePayload): string {
  const where = p.account ?? p.bucket;
  return `File "${p.title}" (${p.date}) to ${where} [${p.workstream}]`;
}

export function seriesSummaryLine(p: SeriesUpdatePayload): string {
  return `Update rolling series "${p.seriesName}" for ${p.meetingTitle} (${p.date})`;
}

// What staging should do given the latest prior proposal for the same
// (kind, dedupeKey). Approved and rejected proposals latch: a re-pull never
// re-stages a meeting Jordan already decided. A prior execution error does not
// latch, so the fix path is simply pull again + approve again.
export type StageAction =
  | "insert"
  | "refresh" // pending exists, payload changed: update in place
  | "unchanged" // pending exists, payload identical
  | "skip-approved"
  | "skip-rejected";

export function stageAction(
  existingStatus: string | null,
  payloadChanged: boolean,
  // A rejected proposal may be re-staged when the SOURCE changed since the
  // rejection (Jordan fixed the note in Granola): only genuinely changed
  // content comes back; re-pulling the same bad note stays latched.
  allowRestageRejected = false,
): StageAction {
  switch (existingStatus) {
    case null:
    case "error":
    case "expired":
    case "superseded":
      return "insert";
    case "pending":
      return payloadChanged ? "refresh" : "unchanged";
    case "approved":
      return "skip-approved";
    case "rejected":
      return allowRestageRejected && payloadChanged ? "insert" : "skip-rejected";
    default:
      return "insert";
  }
}

// JSON.stringify with recursively sorted object keys. Postgres jsonb does not
// preserve key order, so naive stringify comparison of a stored payload vs a
// fresh one would report spurious changes.
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
