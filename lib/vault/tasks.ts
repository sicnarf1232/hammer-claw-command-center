import { splitFrontmatter } from "./frontmatter";
import { parseWikilinkBody } from "./wikilink";
import type { Frontmatter, Priority, Task, Wikilink } from "./types";

const CHECKBOX_RE = /^(\s*)- \[( |x|X)\] (.+)$/;

// Extract every [key:: value] inline field from one line.
// Values may contain nested [[wikilinks]] whose ]] would otherwise be mistaken
// for the field's closing bracket, so we scan with a bracket-balance counter.
export interface InlineFieldScan {
  fields: Record<string, string>;
  // The line with all matched field spans removed (for prose detection).
  remainder: string;
}

const FIELD_OPEN_RE = /\[([A-Za-z][\w-]*)::/y;

export function scanInlineFields(line: string): InlineFieldScan {
  const fields: Record<string, string> = {};
  const keptChars: string[] = [];
  let i = 0;
  while (i < line.length) {
    FIELD_OPEN_RE.lastIndex = i;
    const open = FIELD_OPEN_RE.exec(line);
    if (open && open.index === i) {
      const key = open[1];
      const valueStart = i + open[0].length;
      let balance = 1; // the field-opening '[' is already consumed
      let j = valueStart;
      for (; j < line.length; j++) {
        const c = line[j];
        if (c === "[") balance++;
        else if (c === "]") {
          balance--;
          if (balance === 0) break;
        }
      }
      if (balance === 0) {
        const value = line.slice(valueStart, j).trim();
        fields[key] = value;
        i = j + 1; // skip past the closing ']'
        continue;
      }
      // Unbalanced: not a real field, keep the char and move on.
    }
    keptChars.push(line[i]);
    i++;
  }
  return { fields, remainder: keptChars.join("").trim() };
}

const NOTES_RE = /^Notes:\s?(.*)$/;

// Parse the continuation rows beneath a checkbox line. Returns the merged
// fields, the first prose line as description, the Notes: line, and the index
// of the first line that is no longer part of this task block.
export interface Continuation {
  fields: Record<string, string>;
  description: string;
  notes: string;
  nextIndex: number;
}

export function parseContinuation(
  lines: string[],
  startIndex: number,
  baseIndentLen: number,
): Continuation {
  const fields: Record<string, string> = {};
  let description = "";
  let notes = "";
  let idx = startIndex;

  for (; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line.trim() === "") break; // blank line ends the block
    const indentLen = line.length - line.trimStart().length;
    if (indentLen <= baseIndentLen) break; // not more-indented: block ended
    if (CHECKBOX_RE.test(line)) break; // a nested/next checkbox: stop here

    const trimmed = line.trim();
    const notesMatch = trimmed.match(NOTES_RE);
    if (notesMatch) {
      notes = notesMatch[1];
      continue;
    }

    const scan = scanInlineFields(line);
    // Merge any fields found (covers pure-field rows and the draft/thread row).
    for (const [k, v] of Object.entries(scan.fields)) fields[k] = v;
    // A line that still has prose after stripping fields is the description.
    if (scan.remainder !== "" && description === "") {
      description = trimmed;
    }
  }

  return { fields, description, notes, nextIndex: idx };
}

function asPriority(v: string | undefined): Priority | undefined {
  if (v === "high" || v === "med" || v === "low") return v;
  return undefined;
}

function parseCustomer(
  v: string | undefined,
): Wikilink | "internal" | undefined {
  if (!v) return undefined;
  if (v.trim() === "internal") return "internal";
  const m = v.match(/\[\[([^\]]+)\]\]/);
  if (m) return parseWikilinkBody(m[1]);
  return undefined;
}

function parseDraft(v: string | undefined): Wikilink | undefined {
  if (!v) return undefined;
  const m = v.match(/\[\[([^\]]+)\]\]/);
  return m ? parseWikilinkBody(m[1]) : undefined;
}

// Build the typed Task from raw fields + frontmatter inheritance.
export function buildTask(args: {
  done: boolean;
  title: string;
  fields: Record<string, string>;
  description: string;
  notes: string;
  frontmatterWorkstream?: string;
  sourceFile: string;
  sourceLine: number;
}): Task {
  const f = args.fields;
  return {
    done: args.done,
    title: args.title.trim(),
    fields: f,
    description: args.description,
    notes: args.notes,
    workstream: f.workstream ?? args.frontmatterWorkstream,
    customer: parseCustomer(f.customer),
    due: f.due,
    priority: asPriority(f.priority),
    created: f.created,
    scheduled: f.scheduled,
    draft: parseDraft(f.draft),
    thread: f.thread,
    taskStatus: f.status,
    completed: f.completed,
    sourceFile: args.sourceFile,
    sourceLine: args.sourceLine,
  };
}

// Parse all top-level tasks in a markdown document.
export function parseTasks(content: string, sourceFile = ""): Task[] {
  const { frontmatter, body } = splitFrontmatter(content);
  // Re-split on raw content so source line numbers match the original file.
  const allLines = content.replace(/\r\n/g, "\n").split("\n");
  const frontmatterLineCount = countFrontmatterLines(content);
  return parseTasksFromLines(
    allLines,
    frontmatter,
    sourceFile,
    frontmatterLineCount,
    body,
  );
}

function countFrontmatterLines(content: string): number {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i + 1;
  }
  return 0;
}

function parseTasksFromLines(
  allLines: string[],
  frontmatter: Frontmatter,
  sourceFile: string,
  startLine: number,
  _body: string,
): Task[] {
  const tasks: Task[] = [];
  let i = startLine;
  while (i < allLines.length) {
    const line = allLines[i];
    const m = line.match(CHECKBOX_RE);
    if (!m) {
      i++;
      continue;
    }
    const indent = m[1];
    const done = m[2].toLowerCase() === "x";
    const title = m[3];
    const cont = parseContinuation(allLines, i + 1, indent.length);
    tasks.push(
      buildTask({
        done,
        title,
        fields: cont.fields,
        description: cont.description,
        notes: cont.notes,
        frontmatterWorkstream:
          typeof frontmatter.workstream === "string"
            ? frontmatter.workstream
            : undefined,
        sourceFile,
        sourceLine: i,
      }),
    );
    i = cont.nextIndex;
  }
  return tasks;
}
