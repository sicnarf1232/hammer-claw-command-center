import type { Workstream } from "@/lib/vault/types";
import type { TriagedMeeting } from "@/lib/ai";

// Pure rendering for the Granola pull: turn a triaged meeting into the vault's
// meeting-note markdown (docs/02 contract) and compute its file location and
// index row. No network here, so it is unit-tested directly.

export interface MeetingRow {
  date: string; // YYYY-MM-DD
  bucket: string;
  title: string;
  basename: string; // filename without .md (the [[wikilink]] target)
}

export interface RenderInput {
  triaged: TriagedMeeting;
  date: string; // YYYY-MM-DD meeting date
  meetingTime: string | null; // "2:30 PM MDT" or null
  attendees: string[]; // display names
  granolaId: string; // not_...
  webUrl?: string | null;
  createdISO: string; // YYYY-MM-DD the note was filed (today)
}

// Strip characters that are illegal in filenames or that break [[wikilinks]].
export function sanitizeForFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|[\]#^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function meetingBasename(date: string, title: string): string {
  const clean = sanitizeForFilename(title) || "Untitled meeting";
  return `${date} - ${clean}`;
}

// Where the note files, by workstream and (for customer meetings) account.
// Internal meetings (no customer, Internal bucket) go to the Internal folder;
// only genuinely ambiguous account-less meetings stage in _Unfiled.
export function meetingFolder(
  ws: Workstream,
  account: string | null,
  bucket?: string,
): string {
  const acct = account ? sanitizeForFilename(account) : null;
  const internal = !acct && /internal/i.test(bucket ?? "");
  switch (ws) {
    case "merit":
      if (acct) return `300 Merit/Meetings/${acct}`;
      return internal
        ? `300 Merit/Meetings/Internal`
        : `300 Merit/Meetings/_Unfiled`;
    case "sloan":
      return acct ? `500 Sloan/Meetings/${acct}` : `500 Sloan/Meetings`;
    case "personal":
      return `600 Personal/Meetings`;
    case "shared":
    default:
      return internal
        ? `300 Merit/Meetings/Internal`
        : `300 Merit/Meetings/_Unfiled`;
  }
}

// Parse a meeting file path into an index row, or null if it is not a dated
// meeting note ("YYYY-MM-DD - Title.md"). Bucket comes from the folder: the
// account name, or "Internal"/"Unfiled", or the workstream for loose files.
export function indexRowFromPath(path: string): MeetingRow | null {
  const file = path.split("/").pop() ?? "";
  const m = file.match(/^(\d{4}-\d{2}-\d{2}) - (.+)\.md$/);
  if (!m) return null;
  const [, date, title] = m;
  return {
    date,
    bucket: bucketFromPath(path),
    title,
    basename: file.replace(/\.md$/, ""),
  };
}

function bucketFromPath(path: string): string {
  const parts = path.split("/");
  const mi = parts.lastIndexOf("Meetings");
  const seg = mi >= 0 ? parts[mi + 1] : undefined;
  if (!seg || seg.endsWith(".md")) {
    const ws = parts[0] ?? "";
    if (/Personal/i.test(ws)) return "Personal";
    if (/Sloan/i.test(ws)) return "Sloan";
    return "Internal";
  }
  if (seg === "_Unfiled") return "Unfiled";
  return seg;
}

// Rebuild the index table from a full set of rows (newest first, deduped by
// basename, capped at 30), replacing the existing table. Self-heals a stale
// index regardless of who filed the notes. Surrounding prose is preserved.
export function rebuildMeetingsIndex(
  content: string,
  rows: MeetingRow[],
  updateStamp?: string,
): string {
  return writeIndexTable(content, rows, updateStamp, true);
}

function yamlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlList(items: string[]): string {
  return `[${items.map((i) => i.replace(/[[\],]/g, " ").trim()).filter(Boolean).join(", ")}]`;
}

// Render the full meeting note (frontmatter + body) to the canonical format
// (Meeting Notes App Handoff SPEC section 3): TL;DR, Action Items, Key
// Decisions, Numbers That Matter, Watch-Outs, Full Notes. Optional sections are
// omitted when empty; TL;DR and Action Items always render.
export function renderMeetingNote(input: RenderInput): string {
  const { triaged: t, date, meetingTime, attendees, granolaId } = input;

  const fm: string[] = ["---"];
  fm.push(`workstream: ${t.workstream}`);
  fm.push("type: meeting");
  fm.push("status: active");
  fm.push(`created: ${input.createdISO}`);
  fm.push(`date: ${date}`);
  if (meetingTime) fm.push(`meeting_time: ${meetingTime}`);
  if (t.account) fm.push(`customer: ${yamlString(`[[${t.account}]]`)}`);
  if (attendees.length) fm.push(`attendees: ${yamlList(attendees)}`);
  if (t.series) fm.push(`series: ${t.series}`);
  fm.push(`granola_id: ${granolaId}`);
  fm.push("---");

  // Title and meta match Jordan's vault: "Title -- Account", a Customer/Date/
  // Time line, then a Bucket line carrying the bucket and a short topic.
  const titleSuffix = t.account ? ` -- ${t.account}` : "";
  const metaLine1: string[] = [];
  if (t.account) metaLine1.push(`**Customer:** [[${t.account}]]`);
  metaLine1.push(`**Date:** ${date}`);
  if (meetingTime) metaLine1.push(`**Time:** ${meetingTime}`);

  const body: string[] = ["", `# ${t.title}${titleSuffix}`, "", metaLine1.join(" · ")];
  body.push(`**Bucket:** ${t.bucket}${t.topic ? ` · ${t.topic}` : ""}`);

  // Always-render sections.
  body.push("", "## TL;DR", "", t.tldr || "(no summary captured)");
  body.push("", "## Action Items", "", renderActionItems(t, date));

  // Optional sections, omitted when empty.
  if (t.decisions.length) {
    body.push("", "## Key Decisions", "", bullets(t.decisions));
  }
  if (t.numbers.length) {
    body.push("", "## Numbers That Matter", "", bullets(t.numbers));
  }
  if (t.watchouts.length) {
    body.push("", "## Watch-Outs", "", bullets(t.watchouts));
  }
  if (t.fullNotes.length) {
    body.push("", "## Full Notes");
    for (const s of t.fullNotes) {
      body.push("", `### ${s.subsection}`, "", s.text.trim());
    }
  }
  body.push("");

  return [...fm, ...body].join("\n");
}

function bullets(items: string[]): string {
  return items.map((d) => `- ${d}`).join("\n");
}

export interface ManualNoteInput {
  title: string;
  date: string; // YYYY-MM-DD
  createdISO: string; // YYYY-MM-DD the note was filed (today)
  account?: string | null;
  attendees?: string[];
  body?: string; // free-text notes, lands under Full Notes
}

// Render a manually filed meeting note (no Granola pull). Same frontmatter
// contract as renderMeetingNote (workstream, type, status, created, date,
// customer, attendees); TL;DR seeds from the first body line or "(manual
// note)"; the body rides under Full Notes. Pure, so it is unit-tested.
export function renderManualMeetingNote(input: ManualNoteInput): string {
  const title = input.title.trim();
  const account = input.account?.trim() || null;
  const attendees = (input.attendees ?? []).map((a) => a.trim()).filter(Boolean);
  const bodyText = (input.body ?? "").replace(/\r\n/g, "\n").trim();

  const fm: string[] = ["---"];
  fm.push("workstream: merit");
  fm.push("type: meeting");
  fm.push("status: active");
  fm.push(`created: ${input.createdISO}`);
  fm.push(`date: ${input.date}`);
  if (account) fm.push(`customer: ${yamlString(`[[${account}]]`)}`);
  if (attendees.length) fm.push(`attendees: ${yamlList(attendees)}`);
  fm.push("---");

  const titleSuffix = account ? ` -- ${account}` : "";
  const meta: string[] = [];
  if (account) meta.push(`**Customer:** [[${account}]]`);
  meta.push(`**Date:** ${input.date}`);

  const tldr =
    bodyText.split("\n").map((l) => l.trim()).find(Boolean) ?? "(manual note)";

  const out: string[] = ["", `# ${title}${titleSuffix}`, "", meta.join(" · ")];
  out.push("", "## TL;DR", "", tldr);
  out.push("", "## Full Notes", "", bodyText || "(manual note, no body)");
  out.push("");
  return [...fm, ...out].join("\n");
}

// Action items: one combined "- [ ] Owner: task" list. Jordan's ("me") items
// carry an inline field row so they surface as real tasks (created = meeting
// date; due is the concrete date or TBD to flag). Team/customer items are
// tracked-only with a "🗓️ Due:" line, and a "(confirm)" hint when the due is
// vague. ownerClass is assigned during the pull from the roster.
function renderActionItems(t: TriagedMeeting, date: string): string {
  if (!t.actionItems.length) return "- (none captured)";
  const lines: string[] = [];
  for (const ai of t.actionItems) {
    const cls = ai.ownerClass ?? (ai.isJordans ? "me" : "unknown");
    const owner = ai.owner ? `${ai.owner}: ` : "";
    lines.push(`- [ ] ${owner}${ai.text}`);
    if (cls === "me") {
      const fields: string[] = [];
      if (t.account) fields.push(`[customer:: [[${t.account}]]]`);
      fields.push(`[created:: ${date}]`);
      if (ai.priority) fields.push(`[priority:: ${ai.priority}]`);
      fields.push(`[due:: ${ai.due ?? "TBD"}]`);
      if (!ai.due && ai.dueText) fields.push(`[due_note:: ${ai.dueText}]`);
      lines.push(`    ${fields.join(" ")}`);
    } else if (ai.due) {
      lines.push(`    🗓️ Due: ${ai.due}`);
    } else if (ai.dueText) {
      lines.push(`    🗓️ Due: ${ai.dueText} (confirm)`);
    }
  }
  return lines.join("\n");
}

// Insert new rows into the Meetings-Index table: newest first, dedup by
// basename, capped at 30 (the index is "30 most recent"). Only the table block
// is rewritten; surrounding prose is preserved. Returns the new file content.
export function upsertMeetingsIndex(
  content: string,
  newRows: MeetingRow[],
  updateStamp?: string, // optional "Last update" note
): string {
  return writeIndexTable(content, newRows, updateStamp, false);
}

// Shared table writer. When `rebuild` is true the table is replaced by `rows`
// alone; otherwise `rows` are merged ahead of the existing table. Either way:
// newest first, deduped by basename, capped at 30, surrounding prose preserved.
function writeIndexTable(
  content: string,
  rows: MeetingRow[],
  updateStamp: string | undefined,
  rebuild: boolean,
): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("|") && /\bdate\b/i.test(l) && /\bnote\b/i.test(l)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1 || headerIdx + 1 >= lines.length) {
    return content; // no recognizable table; do not corrupt the file
  }
  const sepIdx = headerIdx + 1;

  let dataEnd = sepIdx + 1;
  while (dataEnd < lines.length && lines[dataEnd].trim().startsWith("|")) {
    dataEnd++;
  }
  const existing = lines.slice(sepIdx + 1, dataEnd);

  const rowToLine = (r: MeetingRow) =>
    `| ${r.date} | ${r.bucket} | ${r.title} | [[${r.basename}]] |`;

  const seen = new Set<string>();
  const merged: { date: string; line: string }[] = [];
  const pushRow = (date: string, basename: string, line: string) => {
    const key = basename.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ date, line });
  };

  for (const r of rows) pushRow(r.date, r.basename, rowToLine(r));
  if (!rebuild) {
    for (const line of existing) {
      const m = line.match(/\[\[([^\]]+)\]\]/);
      const date = line.split("|")[1]?.trim() ?? "";
      pushRow(date, m ? m[1] : line, line);
    }
  }

  merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const capped = merged.slice(0, 30).map((m) => m.line);

  const out = [
    ...lines.slice(0, sepIdx + 1),
    ...capped,
    ...lines.slice(dataEnd),
  ];

  if (updateStamp) {
    for (let i = 0; i < out.length; i++) {
      if (out[i].trim().startsWith("**Last update:**")) {
        out[i] = `**Last update:** ${updateStamp}`;
        break;
      }
    }
  }

  return out.join("\n");
}
