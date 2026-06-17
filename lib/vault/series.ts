import { splitFrontmatter } from "./frontmatter";

// Rolling-series notes: a living doc per recurring meeting, with a pinned
// "Current State" plus a reverse-chronological "Meeting Log". These match
// Jordan's real vault convention: docs live under `<...>/Meetings/.../Rolling/`,
// frontmatter is `type: Rolling Series` with `series` (name), `participants`,
// `tags` (no matchRules). When matchRules are absent we derive them from the
// participants and series name, so existing docs work with no edits.

export const SERIES_DIR_MARKER = "/Rolling/";

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

  const id =
    asString(raw.id) ??
    path.split("/").pop()?.replace(/\.md$/, "") ??
    "series";
  // Jordan's docs name the series in `series`; the handoff sample used `name`.
  const name = asString(raw.series) ?? asString(raw.name) ?? id;
  const participants = toStringArray(raw.participants);
  const tags = toStringArray(raw.tags);

  // Use explicit matchRules when present, else derive them from the series name
  // and participants so existing docs (which have none) still match meetings.
  const mrRaw = raw.matchRules as Record<string, unknown> | undefined;
  const matchRules: SeriesMatchRules = mrRaw
    ? {
        titleContains: toStringArray(mrRaw.titleContains),
        titleAlsoContains: toStringArray(mrRaw.titleAlsoContains),
        attendeesInclude: toStringArray(mrRaw.attendeesInclude),
        topicKeywords: toStringArray(mrRaw.topicKeywords),
      }
    : deriveMatchRules(name, participants, tags);

  const lines = body.split("\n");
  const currentState = sectionBody(lines, /^##\s+Current State/i).trim();
  const log = parseLog(lines);

  return {
    path,
    id,
    name,
    cadence: asString(raw.cadence),
    participants,
    matchRules,
    color: asString(raw.color),
    status: asString(raw.status),
    updated: asString(raw.updated),
    currentState,
    log,
    raw: content,
  };
}

// Derive matchRules from a series with no explicit rules: non-Jordan
// participants drive both the title hint and the required-attendee set; a "1:1"
// in the name adds the 1:1 title variants; tags become soft topic keywords.
function deriveMatchRules(
  name: string,
  participants: string[],
  tags: string[],
): SeriesMatchRules {
  const others = participants
    .filter((p) => !/jordan/i.test(p))
    .map((p) => p.split(/\s+/)[0]) // first name
    .filter(Boolean);
  const isOneOnOne = /\b1\s*[:\- ]?\s*1\b|1on1|one on one/i.test(name);
  return {
    titleContains: others.map((o) => o.toLowerCase()),
    // Cover the variants a title may use after filename sanitizing ("1:1" can
    // become "1 1" or "1-1") so a sanitized title still matches.
    titleAlsoContains: isOneOnOne
      ? ["1:1", "1 1", "1-1", "1on1", "one on one"]
      : [],
    attendeesInclude: others,
    topicKeywords: tags,
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

// Apply a new meeting to a series doc, surgically: replace the Current State
// block, prepend the new log entry under Meeting Log, and restamp `updated`.
// Everything else (the H1, frontmatter, existing entries, dividers) is preserved
// byte-for-byte. Action items are intentionally not copied in (the full note
// owns those). If the doc lacks the expected sections, append them.
export function applyMeetingToSeries(
  series: Series,
  entry: NewLogEntry,
  newCurrentState: string,
  asOf: string, // "MM/DD"
): string {
  const text = series.raw.replace(/\r\n/g, "\n");
  const fmEnd = frontmatterEnd(text);
  const head = text.slice(0, fmEnd); // frontmatter block incl. trailing newline
  let bodyLines = text.slice(fmEnd).split("\n");

  bodyLines = replaceCurrentState(bodyLines, newCurrentState.trim(), asOf);
  bodyLines = prependLogEntry(bodyLines, renderLogEntry(entry));

  const newHead = stampUpdated(head, entry.date);
  return newHead + bodyLines.join("\n");
}

export function mmdd(isoDate: string): string {
  const m = isoDate.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}/${m[2]}` : isoDate;
}

// ---- surgical edit helpers ----

// Replace the lines from "## Current State" up to (not including) the next H2,
// keeping a single divider if one was there. Appends the section if missing.
function replaceCurrentState(
  lines: string[],
  body: string,
  asOf: string,
): string[] {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Current State/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  const block = [
    `## Current State (as of ${asOf})`,
    "",
    body || "(no current state captured)",
    "",
  ];
  if (start === -1) {
    // No section yet: put it right after the H1 (or at the top of the body).
    let h1 = lines.findIndex((l) => /^#\s+/.test(l));
    if (h1 === -1) h1 = -1;
    const at = h1 + 1;
    return [...lines.slice(0, at), "", ...block, ...lines.slice(at)];
  }
  let end = start + 1;
  let dividerKept = false;
  while (end < lines.length && !/^##\s+/.test(lines[end])) {
    if (lines[end].trim() === "---") {
      dividerKept = true;
      end++;
      break;
    }
    end++;
  }
  const tail = dividerKept ? ["---", ""] : [];
  return [...lines.slice(0, start), ...block, ...tail, ...lines.slice(end)];
}

// Insert the rendered entry just after the "## Meeting Log" heading (and its
// blank line). Appends the section if missing.
function prependLogEntry(lines: string[], entry: string): string[] {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Meeting Log/i.test(lines[i])) {
      idx = i;
      break;
    }
  }
  const entryLines = [...entry.split("\n"), ""];
  if (idx === -1) {
    return [...lines, "", "## Meeting Log", "", ...entryLines];
  }
  let at = idx + 1;
  if (at < lines.length && lines[at].trim() === "") at++; // keep one blank line
  return [...lines.slice(0, at), ...entryLines, ...lines.slice(at)];
}

function frontmatterEnd(text: string): number {
  if (!text.startsWith("---")) return 0;
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") return 0;
  let offset = lines[0].length + 1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return offset + lines[i].length + 1; // include the closing fence + newline
    }
    offset += lines[i].length + 1;
  }
  return 0;
}

// ---- rendering helpers ----

// Match Jordan's existing log entries: "### MM/DD — Title" with an em dash.
function renderLogEntry(entry: NewLogEntry): string {
  const lines = [`### ${mmdd(entry.date)} — ${entry.title}`];
  for (const b of entry.bullets) lines.push(`- ${b}`);
  lines.push(`- Source: [[${entry.meetingBasename}]]`);
  return lines.join("\n");
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

// Restamp `updated:` inside a frontmatter block (text including the fences and
// trailing newline). Preserves the trailing newline so the body joins cleanly.
function stampUpdated(head: string, isoDate: string): string {
  if (!head) return head;
  const lines = head.split("\n");
  let closing = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === "---") {
      closing = i;
      break;
    }
  }
  const limit = closing === -1 ? lines.length : closing;
  let found = false;
  for (let i = 0; i < limit; i++) {
    if (/^updated\s*:/.test(lines[i])) {
      lines[i] = `updated: ${isoDate}`;
      found = true;
      break;
    }
  }
  if (!found && closing !== -1) {
    lines.splice(closing, 0, `updated: ${isoDate}`);
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
