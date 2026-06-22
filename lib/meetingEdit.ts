import type { MeetingNote } from "@/lib/vault/types";

// Pure transform for Phase C (editable meeting notes): take an existing meeting
// note's markdown plus a structured edit and produce the rewritten markdown.
// Frontmatter is preserved byte-for-byte except the fields the app manages
// (attendees, customer); the body is re-emitted in the canonical section order
// (Meeting Notes App Handoff SPEC section 3); any non-canonical sections are
// preserved verbatim, appended after the canonical block. No network here, so
// this is unit-tested directly (the parser is the read contract, this is write).

export interface EditableActionItem {
  done: boolean;
  isJordans: boolean; // Jordan's items keep the inline [field:: ] row (feed /today)
  owner: string; // "" when none
  text: string;
  due: string; // "", "TBD", a YYYY-MM-DD, or vague text ("this week")
  priority?: string; // high | med | low (Jordan's items)
  customer?: string; // [[customer]] basename to preserve on Jordan's items
  created?: string; // [created:: ] to preserve (the meeting date)
}

export interface MeetingEdit {
  title: string; // bare H1 title, account suffix excluded (we manage the suffix)
  account: string | null; // customer/account basename, or null to clear
  topic: string | null;
  attendees: string[];
  // Canonical content-section bodies keyed by heading. Empty string drops the
  // optional section; TL;DR and Action Items always render.
  sections: Record<string, string>;
  actionItems: EditableActionItem[];
}

// The canonical heading order. Action Items and TL;DR always render; the rest
// render only when they have content.
const CANON_ORDER = [
  "TL;DR",
  "Action Items",
  "Key Decisions",
  "Numbers That Matter",
  "Watch-Outs",
  "Full Notes",
] as const;

const CANON_SET = new Set<string>(CANON_ORDER);

// Build the editor's working model from a parsed note. Strips the " -- Account"
// suffix from the title (the editor manages account + suffix separately).
export function meetingNoteToEditable(note: MeetingNote): MeetingEdit {
  const account = note.customer?.basename ?? null;
  let title = note.title;
  if (account) {
    // Title is "Title -- Account"; strip the suffix to get the bare title.
    const suffix = ` -- ${account}`;
    if (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
  }

  const sections: Record<string, string> = {};
  for (const h of CANON_ORDER) {
    if (h === "Action Items") continue; // action items are structured, not text
    sections[h] = note.sections[h] ?? "";
  }

  const actionItems: EditableActionItem[] = note.actionItems.map((ai) => ({
    done: ai.done,
    isJordans: ai.isJordans,
    owner: ai.owner ?? "",
    text: ai.text,
    due: ai.due ?? "",
    priority: ai.task?.priority,
    customer:
      ai.task?.customer && ai.task.customer !== "internal"
        ? ai.task.customer.basename
        : undefined,
    created: ai.task?.created,
  }));

  return {
    title,
    account,
    topic: note.topic ?? null,
    attendees: [...note.attendees],
    sections,
    actionItems,
  };
}

// Apply the edit to the raw note content and return the rewritten markdown.
export function applyMeetingEdit(content: string, edit: MeetingEdit): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  const fmClose = frontmatterCloseIndex(lines);
  const fmLines =
    fmClose >= 0
      ? editFrontmatter(lines.slice(0, fmClose + 1), edit)
      : [];
  const bodyLines = lines.slice(fmClose >= 0 ? fmClose + 1 : 0);

  const body = rebuildBody(bodyLines, edit);

  const out = fmClose >= 0 ? [...fmLines, ...body] : body;
  // Single trailing newline, matching the renderer's output.
  return out.join("\n").replace(/\n*$/, "\n");
}

// ---- frontmatter ----

function frontmatterCloseIndex(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i;
  }
  return -1;
}

// Surgically set attendees + customer in the frontmatter block (fences
// included). All other fields are preserved verbatim.
function editFrontmatter(fm: string[], edit: MeetingEdit): string[] {
  const open = fm[0];
  const close = fm[fm.length - 1];
  const inner = fm.slice(1, -1);

  setOrRemove(
    inner,
    /^attendees\s*:/,
    edit.attendees.length ? `attendees: ${yamlList(edit.attendees)}` : null,
  );
  setOrRemove(
    inner,
    /^customer\s*:/,
    edit.account ? `customer: ${yamlString(`[[${edit.account}]]`)}` : null,
  );

  return [open, ...inner, close];
}

// Replace the first line matching `re` with `value`, remove it when value is
// null, or insert `value` at the end of the block when absent. In-place.
function setOrRemove(inner: string[], re: RegExp, value: string | null): void {
  const idx = inner.findIndex((l) => re.test(l.trim()));
  if (idx >= 0) {
    if (value === null) inner.splice(idx, 1);
    else inner[idx] = value;
  } else if (value !== null) {
    inner.push(value);
  }
}

// ---- body ----

interface Section {
  heading: string;
  body: string[]; // lines after the "## heading" line, up to the next "## "
}

function rebuildBody(bodyLines: string[], edit: MeetingEdit): string[] {
  // Split the body into a preamble (everything before the first "## ") and an
  // ordered list of sections.
  let firstSection = bodyLines.length;
  for (let i = 0; i < bodyLines.length; i++) {
    if (/^##\s+/.test(bodyLines[i])) {
      firstSection = i;
      break;
    }
  }
  const preamble = editPreamble(bodyLines.slice(0, firstSection), edit);

  const original: Section[] = [];
  let current: Section | null = null;
  for (let i = firstSection; i < bodyLines.length; i++) {
    const h = bodyLines[i].match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = { heading: h[1].trim(), body: [] };
      original.push(current);
    } else if (current) {
      current.body.push(bodyLines[i]);
    }
  }

  const blocks: string[] = [];
  const emit = (heading: string, body: string) => {
    blocks.push(`## ${heading}`, "", body.trim(), "");
  };

  for (const h of CANON_ORDER) {
    if (h === "Action Items") {
      emit("Action Items", serializeActionItems(edit.actionItems));
      continue;
    }
    const value = (edit.sections[h] ?? "").trim();
    if (value) emit(h, value);
    else if (h === "TL;DR") emit("TL;DR", "(no summary captured)");
  }

  // Preserve any non-canonical sections verbatim (appended after the canonical
  // block), so editing never silently drops content the app does not model.
  for (const s of original) {
    if (CANON_SET.has(s.heading)) continue;
    blocks.push(`## ${s.heading}`, ...trimBlankEnds(s.body), "");
  }

  return [...preamble, ...blocks];
}

// Edit the H1, the Customer/Date/Time meta line, and the Bucket/Topic line in
// the preamble. Lines that are not present are left alone (defensive: legacy
// notes may not carry every meta line).
function editPreamble(preamble: string[], edit: MeetingEdit): string[] {
  const out = [...preamble];
  const suffix = edit.account ? ` -- ${edit.account}` : "";

  // H1.
  const h1 = out.findIndex((l) => /^#\s+/.test(l));
  if (h1 >= 0) out[h1] = `# ${edit.title}${suffix}`;

  // Customer/Date/Time meta line: rebuild only the Customer segment.
  const metaIdx = out.findIndex(
    (l) => /\*\*Customer:\*\*/.test(l) || /\*\*Date:\*\*/.test(l),
  );
  if (metaIdx >= 0) {
    const segs = out[metaIdx]
      .split("·")
      .map((s) => s.trim())
      .filter((s) => s && !/^\*\*Customer:\*\*/.test(s));
    if (edit.account) segs.unshift(`**Customer:** [[${edit.account}]]`);
    out[metaIdx] = segs.join(" · ");
  }

  // Bucket/Topic line. The parser models the whole line value (which for the
  // canonical format is "<bucket> · <topic-detail>") as `topic`, so we write it
  // back whole, preserving whichever keyword the note used.
  const bucketIdx = out.findIndex((l) =>
    /^\*\*(?:Bucket|Topic):\*\*/.test(l.trim()),
  );
  if (bucketIdx >= 0) {
    const kw = out[bucketIdx].match(/^\s*\*\*(Bucket|Topic):\*\*/)?.[1] ?? "Bucket";
    const topic = (edit.topic ?? "").trim();
    if (topic) out[bucketIdx] = `**${kw}:** ${topic}`;
    else out.splice(bucketIdx, 1);
  }

  return out;
}

// ---- action items ----

// Serialize the action items back to the dual-capture format. Jordan's items
// keep the inline field row (so /today and /tasks pick them up); a due defaults
// to TBD so an emptied due stays a flag rather than vanishing. Others render
// tracking-only with a "🗓️ Due:" line when a due is present.
export function serializeActionItems(items: EditableActionItem[]): string {
  if (!items.length) return "- (none captured)";
  const lines: string[] = [];
  for (const ai of items) {
    const mark = ai.done ? "x" : " ";
    const owner = ai.owner.trim() ? `${ai.owner.trim()}: ` : "";
    lines.push(`- [${mark}] ${owner}${ai.text.trim()}`);
    if (ai.isJordans) {
      const fields: string[] = [];
      if (ai.customer) fields.push(`[customer:: [[${ai.customer}]]]`);
      if (ai.created) fields.push(`[created:: ${ai.created}]`);
      if (ai.priority) fields.push(`[priority:: ${ai.priority}]`);
      fields.push(`[due:: ${ai.due.trim() || "TBD"}]`);
      lines.push(`    ${fields.join(" ")}`);
    } else if (ai.due.trim()) {
      lines.push(`    🗓️ Due: ${ai.due.trim()}`);
    }
  }
  return lines.join("\n");
}

// ---- small helpers ----

function trimBlankEnds(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}

function yamlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlList(items: string[]): string {
  return `[${items
    .map((i) => i.replace(/[[\],]/g, " ").trim())
    .filter(Boolean)
    .join(", ")}]`;
}

// Surgically set (or clear) just the `customer:` frontmatter line, leaving the
// body untouched. Used by the quick link / internal classifier so a misfiled
// "internal about a customer" note can be relinked without a full re-emit.
// account = null clears the link (marks the note internal at the frontmatter
// level). Returns the original string unchanged when there is no frontmatter.
export function setMeetingCustomer(
  content: string,
  account: string | null,
): string {
  const text = content.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return content;
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) return content;

  let idx = -1;
  for (let i = 1; i < close; i++) {
    if (/^customer\s*:/.test(lines[i])) {
      idx = i;
      break;
    }
  }
  const newLine = account ? `customer: ${yamlString(`[[${account}]]`)}` : null;

  if (idx >= 0) {
    if (newLine) lines[idx] = newLine;
    else lines.splice(idx, 1);
  } else if (newLine) {
    // Insert after the attendees line when present, else just before the fence.
    let insertAt = close;
    for (let i = 1; i < close; i++) {
      if (/^attendees\s*:/.test(lines[i])) insertAt = i + 1;
    }
    lines.splice(insertAt, 0, newLine);
  }
  return lines.join("\n");
}

// Set or strip the "<Title> -- <Account>" suffix on the note's H1, matching the
// suffix convention applyMeetingEdit uses. account = null removes the suffix.
// Used by full reclassification so the visible title follows the account.
export function setMeetingTitleAccount(
  content: string,
  account: string | null,
): string {
  const text = content.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+?)\s*$/);
    if (!m) continue;
    const base = m[1].replace(/\s+--\s+.*$/, "").trim();
    lines[i] = account ? `# ${base} -- ${account}` : `# ${base}`;
    break;
  }
  return lines.join("\n");
}
