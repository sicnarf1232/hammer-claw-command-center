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
export function meetingFolder(ws: Workstream, account: string | null): string {
  const acct = account ? sanitizeForFilename(account) : null;
  switch (ws) {
    case "merit":
      return acct ? `300 Merit/Meetings/${acct}` : `300 Merit/Meetings/_Unfiled`;
    case "sloan":
      return acct ? `500 Sloan/Meetings/${acct}` : `500 Sloan/Meetings`;
    case "personal":
      return `600 Personal/Meetings`;
    case "shared":
    default:
      // No shared Meetings home in the folder model; stage for refiling.
      return `300 Merit/Meetings/_Unfiled`;
  }
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
  const { triaged: t, date, meetingTime, attendees, granolaId, webUrl } = input;

  const fm: string[] = ["---"];
  fm.push(`workstream: ${t.workstream}`);
  fm.push("type: meeting");
  fm.push("status: active");
  fm.push(`created: ${input.createdISO}`);
  fm.push(`date: ${date}`);
  if (meetingTime) fm.push(`meeting_time: ${meetingTime}`);
  if (t.account) fm.push(`customer: ${yamlString(`[[${t.account}]]`)}`);
  if (t.topic) fm.push(`topic: ${yamlString(t.topic)}`);
  if (attendees.length) fm.push(`attendees: ${yamlList(attendees)}`);
  if (t.series) fm.push(`series: ${t.series}`);
  fm.push(`granola_id: ${granolaId}`);
  if (webUrl) fm.push(`granola_url: ${webUrl}`);
  fm.push(`source: granola-pull`);
  fm.push("---");

  const titleSuffix = t.account ? ` - ${t.account}` : "";
  const metaLine1: string[] = [];
  if (t.account) metaLine1.push(`**Customer:** [[${t.account}]]`);
  metaLine1.push(`**Date:** ${date}`);
  if (meetingTime) metaLine1.push(`**Time:** ${meetingTime}`);
  if (t.series) metaLine1.push(`**Series:** ${t.series}`);

  const body: string[] = ["", `# ${t.title}${titleSuffix}`, "", metaLine1.join(" · ")];
  if (t.topic) body.push(`**Topic:** ${t.topic}`);

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

// Dual-capture action items: Jordan's items carry an inline field row (so the
// task parser surfaces them as real tasks); everyone else's stay plain, with an
// optional indented "Due:" line (Handoff SPEC section 3).
function renderActionItems(t: TriagedMeeting, date: string): string {
  if (!t.actionItems.length) return "- (none captured)";
  const lines: string[] = [];
  for (const ai of t.actionItems) {
    const owner = ai.owner ? `${ai.owner}: ` : "";
    const box = "- [ ] ";
    if (ai.isJordans) {
      lines.push(`${box}${owner || "Jordan: "}${ai.text}`);
      const fields: string[] = [];
      if (t.account) fields.push(`[customer:: [[${t.account}]]]`);
      fields.push(`[created:: ${date}]`);
      if (ai.priority) fields.push(`[priority:: ${ai.priority}]`);
      if (ai.due) fields.push(`[due:: ${ai.due}]`);
      lines.push(`    ${fields.join(" ")}`);
    } else {
      lines.push(`${box}${owner}${ai.text}`);
      if (ai.due) lines.push(`    Due: ${ai.due}`);
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
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  // Locate the header row ("| Date | Bucket | ...") and its separator.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("|") && /\bdate\b/i.test(l) && /\bnote\b/i.test(l)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1 || headerIdx + 1 >= lines.length) {
    // No recognizable table; leave the file untouched rather than corrupt it.
    return content;
  }
  const sepIdx = headerIdx + 1;

  // Collect the contiguous data rows directly under the separator.
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

  for (const r of newRows) pushRow(r.date, r.basename, rowToLine(r));
  for (const line of existing) {
    const m = line.match(/\[\[([^\]]+)\]\]/);
    const date = line.split("|")[1]?.trim() ?? "";
    pushRow(date, m ? m[1] : line, line);
  }

  // Newest first, capped at 30.
  merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const capped = merged.slice(0, 30).map((m) => m.line);

  const out = [
    ...lines.slice(0, sepIdx + 1),
    ...capped,
    ...lines.slice(dataEnd),
  ];

  // Refresh the "**Last update:**" line if one exists and a stamp was given.
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
