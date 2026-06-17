import { splitFrontmatter } from "./frontmatter";
import { parseWikilinkBody, basenameOf } from "./wikilink";
import { parseContinuation, buildTask } from "./tasks";
import type {
  ActionItem,
  MeetingNote,
  MeetingsIndexRow,
  Wikilink,
} from "./types";

const CHECKBOX_RE = /^(\s*)- \[( |x|X)\] (.+)$/;

// Parse a meeting note: frontmatter, body sections, and dual-capture action items.
export function parseMeetingNote(content: string, path = ""): MeetingNote {
  const { frontmatter } = splitFrontmatter(content);
  const allLines = content.replace(/\r\n/g, "\n").split("\n");
  const bodyStart = countFrontmatterLines(content);

  const sections = splitBodySections(allLines, bodyStart);

  const attendees = toStringArray(frontmatter.raw.attendees);
  const customer = parseCustomerLink(frontmatter.raw.customer);
  const series = asString(frontmatter.raw.series);
  const topic = asString(frontmatter.raw.topic);
  const granolaId = asString(frontmatter.raw.granola_id);
  const date = frontmatter.date ?? asString(frontmatter.raw.date);
  const title = firstHeading(allLines, bodyStart) ?? basenameOf(path).replace(/\.md$/, "");

  const actionItems = parseActionItems(
    allLines,
    sections.actionItemsRange,
    typeof frontmatter.workstream === "string"
      ? frontmatter.workstream
      : undefined,
    path,
  );

  return {
    path,
    frontmatter,
    title,
    date,
    customer,
    attendees,
    series,
    topic,
    granolaId,
    sections: sections.text,
    actionItems,
  };
}

interface BodySections {
  text: Record<string, string>;
  actionItemsRange: [number, number] | null; // [startLineAfterHeading, endExclusive]
}

function splitBodySections(
  allLines: string[],
  bodyStart: number,
): BodySections {
  const text: Record<string, string> = {};
  let actionItemsRange: [number, number] | null = null;

  let currentHeading: string | null = null;
  let currentStart = bodyStart;

  const flush = (endExclusive: number) => {
    if (currentHeading === null) return;
    const body = allLines.slice(currentStart, endExclusive).join("\n").trim();
    text[currentHeading] = body;
    if (currentHeading.toLowerCase() === "action items") {
      actionItemsRange = [currentStart, endExclusive];
    }
  };

  for (let i = bodyStart; i < allLines.length; i++) {
    const h = allLines[i].match(/^##\s+(.+?)\s*$/);
    if (h) {
      flush(i);
      currentHeading = h[1].trim();
      currentStart = i + 1;
    }
  }
  flush(allLines.length);

  return { text, actionItemsRange };
}

function parseActionItems(
  allLines: string[],
  range: [number, number] | null,
  frontmatterWorkstream: string | undefined,
  path: string,
): ActionItem[] {
  if (!range) return [];
  const [start, end] = range;
  const items: ActionItem[] = [];

  let i = start;
  while (i < end) {
    const line = allLines[i];
    const m = line.match(CHECKBOX_RE);
    if (!m) {
      i++;
      continue;
    }
    const indent = m[1];
    const done = m[2].toLowerCase() === "x";
    const rawTitle = m[3].trim();
    const cont = parseContinuation(allLines, i + 1, indent.length);
    const hasFieldRow = Object.keys(cont.fields).length > 0;

    const { owner, text } = splitOwner(rawTitle);

    if (hasFieldRow) {
      // Jordan's item: a real task with metadata. Surface in task views.
      const task = buildTask({
        done,
        title: rawTitle,
        fields: cont.fields,
        description: cont.description,
        notes: cont.notes,
        frontmatterWorkstream,
        sourceFile: path,
        sourceLine: i,
      });
      items.push({
        done,
        isJordans: true,
        owner,
        text,
        task,
        sourceFile: path,
        sourceLine: i,
      });
    } else {
      // Other owner: tracking only, no field row.
      items.push({
        done,
        isJordans: false,
        owner,
        text,
        sourceFile: path,
        sourceLine: i,
      });
    }
    i = cont.nextIndex > i ? cont.nextIndex : i + 1;
  }

  return items;
}

function splitOwner(title: string): { owner?: string; text: string } {
  // "Zoya: Follow up ..." -> owner Zoya. Avoid splitting on colons inside URLs
  // by requiring the owner segment to be short and word-like.
  const idx = title.indexOf(":");
  if (idx > 0 && idx < 40) {
    const owner = title.slice(0, idx).trim();
    if (/^[A-Za-z][\w .'-]*$/.test(owner)) {
      return { owner, text: title.slice(idx + 1).trim() };
    }
  }
  return { text: title };
}

// Parse the Meetings-Index.md markdown table. Single source of truth for
// "what meetings exist." Resolution of [[basename]] to a file happens in the
// scan layer that has the file list.
export function parseMeetingsIndex(content: string): MeetingsIndexRow[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const rows: MeetingsIndexRow[] = [];
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitTableRow(line);
    if (cells.length < 4) continue;
    const [date, bucket, title, note] = cells;
    // Skip the header and separator rows.
    if (/^-+$/.test(date.replace(/[\s|:]/g, ""))) continue;
    if (date.toLowerCase() === "date") continue;
    const linkMatch = note.match(/\[\[([^\]]+)\]\]/);
    if (!linkMatch) continue;
    const noteBasename = basenameOf(parseWikilinkBody(linkMatch[1]).target);
    rows.push({
      date: date.trim(),
      bucket: bucket.trim(),
      title: title.trim(),
      noteBasename,
    });
  }
  return rows;
}

function splitTableRow(line: string): string[] {
  // Trim the leading/trailing pipe, then split. Does not handle escaped pipes
  // (the vault index does not use them).
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

// ---- small helpers ----

function countFrontmatterLines(content: string): number {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i + 1;
  }
  return 0;
}

function firstHeading(allLines: string[], from: number): string | undefined {
  for (let i = from; i < allLines.length; i++) {
    const m = allLines[i].match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return undefined;
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

function parseCustomerLink(v: unknown): Wikilink | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.match(/\[\[([^\]]+)\]\]/);
  return m ? parseWikilinkBody(m[1]) : undefined;
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
