import { splitFrontmatter } from "./frontmatter";

// Rolling-series notes (Meeting Notes App Handoff SPEC section 5): a living doc
// per recurring meeting, with a pinned "Current State" plus a reverse-
// chronological "Meeting Log". Series docs live in the vault under
// `<workstream>/Meetings/_Series/<id>.md` and carry their own matchRules in
// frontmatter, so the doc IS the config: drop one in and the pull maintains it.

export const SERIES_DIR_MARKER = "/Meetings/_Series/";

export interface SeriesMatchRules {
  titleContains?: string[];
  titleAlsoContains?: string[];
  attendeesInclude?: string[];
  topicKeywords?: string[];
}

export interface SeriesLogEntry {
  heading: string; // the raw "### ..." line text (without the ###)
  text: string; // bullets / source lines under the heading
}

export interface Series {
  path: string;
  id: string;
  name: string;
  cadence?: string;
  participants: string[];
  matchRules: SeriesMatchRules;
  color?: string;
  status?: string;
  updated?: string;
  currentState: string; // markdown under "## Current State"
  log: SeriesLogEntry[]; // newest-first
  raw: string; // the original file content (for write-back)
}

export interface SeriesMatchContext {
  title: string;
  attendees: string[];
  topicText?: string; // topic + tldr, a soft signal
}

export interface NewLogEntry {
  date: string; // YYYY-MM-DD
  title: string;
  bullets: string[];
  meetingBasename: string;
}

// Parse a rolling-series doc into a Series. Tolerant of missing sections.
export function parseSeriesDoc(content: string, path = ""): Series {
  const { frontmatter, body } = splitFrontmatter(content);
  const raw = frontmatter.raw;

  const mrRaw = (raw.matchRules ?? {}) as Record<string, unknown>;
  const matchRules: SeriesMatchRules = {
    titleContains: toStringArray(mrRaw.titleContains),
    titleAlsoContains: toStringArray(mrRaw.titleAlsoContains),
    attendeesInclude: toStringArray(mrRaw.attendeesInclude),
    topicKeywords: toStringArray(mrRaw.topicKeywords),
  };

  const lines = body.split("\n");
  const currentState = sectionBody(lines, /^##\s+Current State/i).trim();
  const log = parseLog(lines);

  const id =
    asString(raw.id) ??
    path.split("/").pop()?.replace(/\.md$/, "") ??
    "series";

  return {
    path,
    id,
    name: asString(raw.name) ?? id,
    cadence: asString(raw.cadence),
    participants: toStringArray(raw.participants),
    matchRules,
    color: asString(raw.color),
    status: asString(raw.status),
    updated: asString(raw.updated),
    currentState,
    log,
    raw: content,
  };
}

// Does a meeting belong to this series? Conservative (SPEC section 5): a clear
// title signal matches; an attendee-only signal requires a tight attendee set
// (just the participants, plus at most one extra) so a group meeting that
// merely includes the person is not mistaken for their 1:1.
export function matchesSeries(
  series: Series,
  ctx: SeriesMatchContext,
): boolean {
  const mr = series.matchRules;
  const title = ctx.title.toLowerCase();
  const has = (a?: string[]): a is string[] => Array.isArray(a) && a.length > 0;

  const titleHas =
    has(mr.titleContains) &&
    mr.titleContains.some((s) => title.includes(s.toLowerCase()));
  const alsoOk =
    !has(mr.titleAlsoContains) ||
    mr.titleAlsoContains.some((s) => title.includes(s.toLowerCase()));
  if (titleHas && alsoOk) return true;

  const attendeesLower = ctx.attendees.map((a) => a.toLowerCase());
  const attendeeMatch =
    has(mr.attendeesInclude) &&
    mr.attendeesInclude.every((n) =>
      attendeesLower.some((a) => a.includes(n.toLowerCase())),
    );
  if (attendeeMatch && has(series.participants)) {
    const participants = series.participants.map((p) => p.toLowerCase());
    const extra = attendeesLower.filter(
      (a) => !participants.some((p) => a.includes(p) || p.includes(a)),
    );
    if (extra.length <= 1) return true; // allow the owner/notetaker
  }
  return false;
}

// Apply a new meeting to a series doc: prepend a log entry and replace Current
// State. Frontmatter is preserved verbatim except the `updated` stamp. Action
// items are intentionally not copied in (the full note owns those).
export function applyMeetingToSeries(
  series: Series,
  entry: NewLogEntry,
  newCurrentState: string,
  asOf: string, // "MM/DD"
): string {
  const { fmBlock, body } = splitFrontmatterBlock(series.raw);

  const newBody = [
    `# ${series.name} - Rolling Notes`,
    "",
    `## Current State (as of ${asOf})`,
    "",
    newCurrentState.trim() || "(no current state captured)",
    "",
    "---",
    "",
    "## Meeting Log",
    "",
    renderLogEntry(entry),
    ...renderExistingLog(series.log),
  ].join("\n");

  const fm = stampUpdated(fmBlock, entry.date);
  return `${fm}\n${newBody}\n`;
}

export function mmdd(isoDate: string): string {
  const m = isoDate.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}/${m[2]}` : isoDate;
}

// ---- rendering helpers ----

function renderLogEntry(entry: NewLogEntry): string {
  const lines = [`### ${mmdd(entry.date)} - ${entry.title}`];
  for (const b of entry.bullets) lines.push(`- ${b}`);
  lines.push(`- Source: [[${entry.meetingBasename}]]`);
  return lines.join("\n");
}

function renderExistingLog(log: SeriesLogEntry[]): string[] {
  if (!log.length) return [];
  const out: string[] = [];
  for (const e of log) {
    out.push("", `### ${e.heading}`);
    const text = e.text.trim();
    if (text) out.push(text);
  }
  return out;
}

// ---- parsing helpers ----

function sectionBody(lines: string[], heading: RegExp): string {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (heading.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return "";
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s+/.test(l)) break; // next H2
    if (l.trim() === "---") break; // explicit divider
    out.push(l);
  }
  return out.join("\n");
}

function parseLog(lines: string[]): SeriesLogEntry[] {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Meeting Log/i.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return [];
  const entries: SeriesLogEntry[] = [];
  let current: SeriesLogEntry | null = null;
  for (let i = start; i < lines.length; i++) {
    const h = lines[i].match(/^###\s+(.+?)\s*$/);
    if (h) {
      current = { heading: h[1].trim(), text: "" };
      entries.push(current);
    } else if (current) {
      current.text += (current.text ? "\n" : "") + lines[i];
    }
  }
  // Trim trailing blank lines in each entry's text.
  for (const e of entries) e.text = e.text.replace(/\n+$/g, "");
  return entries;
}

function splitFrontmatterBlock(content: string): {
  fmBlock: string;
  body: string;
} {
  const text = content.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { fmBlock: "", body: text };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return {
        fmBlock: lines.slice(0, i + 1).join("\n"),
        body: lines.slice(i + 1).join("\n"),
      };
    }
  }
  return { fmBlock: "", body: text };
}

function stampUpdated(fmBlock: string, isoDate: string): string {
  if (!fmBlock) return fmBlock;
  const lines = fmBlock.split("\n");
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^updated\s*:/.test(lines[i])) {
      lines[i] = `updated: ${isoDate}`;
      found = true;
      break;
    }
  }
  if (!found) {
    // Insert before the closing fence.
    lines.splice(lines.length - 1, 0, `updated: ${isoDate}`);
  }
  return lines.join("\n");
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    return v
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
