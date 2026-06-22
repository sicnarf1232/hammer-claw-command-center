import { sanitizeForFilename } from "@/lib/meetingFormat";
import { mmdd } from "./series";

// Pure builders for creating a new rolling-series doc from a detected
// candidate. Placement and the scaffold are decided here (no network), so they
// are unit-tested; the AI summarization + GitHub write live in the server fn.

const ONE_ON_ONE_RE = /\b1\s*[:\- ]?\s*1\b|1on1|one[\s-]?on[\s-]?one/i;

// Where a new series doc lives: alongside that bucket's meetings, in a Rolling
// subfolder. Customer series -> "300 Merit/Meetings/<Customer>/Rolling";
// internal ones -> "300 Merit/Meetings/Internal/Rolling" (matches Mike/Nick).
export function seriesFolderForBucket(bucket: string): string {
  const clean = sanitizeForFilename(bucket) || "Internal";
  return `300 Merit/Meetings/${clean}/Rolling`;
}

// The dominant bucket among a candidate's meetings (most frequent; ties resolve
// to the first seen). Drives auto-placement when a series spans buckets.
export function dominantBucket(buckets: string[]): string {
  if (!buckets.length) return "Internal";
  const counts = new Map<string, number>();
  for (const b of buckets) counts.set(b, (counts.get(b) ?? 0) + 1);
  let best = buckets[0];
  let bestN = -1;
  for (const [b, n] of counts) {
    if (n > bestN) {
      best = b;
      bestN = n;
    }
  }
  return best;
}

// Filename (no extension) for the series. 1:1s follow Jordan's "<Person> 1on1"
// convention; others use the sanitized name.
export function seriesFilename(name: string, isOneOnOne: boolean): string {
  if (isOneOnOne) {
    const person = name
      .replace(ONE_ON_ONE_RE, "")
      .replace(/\/.*$/, "") // drop "/ Jordan" side
      .replace(/jordan(\s+francis)?/i, "")
      .trim();
    if (person) return `${sanitizeForFilename(person)} 1on1`;
  }
  return sanitizeForFilename(name) || "Series";
}

// Full repo-relative path for a new series doc.
export function seriesDocPath(bucket: string, name: string, isOneOnOne: boolean): string {
  return `${seriesFolderForBucket(bucket)}/${seriesFilename(name, isOneOnOne)}.md`;
}

export interface ScaffoldInput {
  name: string;
  participants: string[];
  cadence?: string;
  tags?: string[];
  workstream?: string; // defaults to "merit"
  createdISO: string; // YYYY-MM-DD
}

// The empty starting doc: frontmatter the parser understands plus the two
// sections (emoji headings, matching Jordan's real docs). Meetings are folded
// in afterward with applyMeetingToSeries, which fills Current State and the log.
export function buildSeriesScaffold(input: ScaffoldInput): string {
  const ws = input.workstream ?? "merit";
  const participants = input.participants.filter(Boolean);
  const tags = (input.tags ?? []).filter(Boolean);
  const fm = [
    "---",
    "type: Rolling Series",
    `series: ${input.name}`,
    ...(input.cadence ? [`cadence: ${input.cadence}`] : []),
    `participants: [${participants.join(", ")}]`,
    `tags: [${tags.join(", ")}]`,
    `workstream: ${ws}`,
    "status: active",
    `created: ${input.createdISO}`,
    `updated: ${input.createdISO}`,
    "---",
  ];
  const body = [
    "",
    `# ${input.name}`,
    "",
    `## 📍 Current State (as of ${mmdd(input.createdISO)})`,
    "",
    "(no current state captured)",
    "",
    "---",
    "",
    "## 📅 Meeting Log",
    "",
  ];
  return fm.join("\n") + "\n" + body.join("\n");
}

// Best-effort participants for the create form to pre-fill: a 1:1 is Jordan
// plus the other person inferred from the name; otherwise just Jordan (the user
// adds the rest). Non-1:1 attendees are not known from filenames alone.
export function defaultParticipants(name: string, isOneOnOne: boolean): string[] {
  if (isOneOnOne) {
    const person = name
      .replace(ONE_ON_ONE_RE, "")
      .replace(/\/.*$/, "")
      .replace(/jordan(\s+francis)?/i, "")
      .trim();
    return person ? ["Jordan Francis", person] : ["Jordan Francis"];
  }
  return ["Jordan Francis"];
}
