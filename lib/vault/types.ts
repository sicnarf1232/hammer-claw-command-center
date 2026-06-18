// Typed outputs for every vault parser. UI and API code consume these shapes;
// they never parse markdown themselves (CLAUDE.md convention).

export type Workstream =
  | "merit"
  | "sloan"
  | "personal"
  | "shared";

export const WORKSTREAMS: Workstream[] = [
  "merit",
  "sloan",
  "personal",
  "shared",
];

export function isWorkstream(value: unknown): value is Workstream {
  return (
    typeof value === "string" &&
    (WORKSTREAMS as string[]).includes(value)
  );
}

export type Priority = "high" | "med" | "low";

// Parsed YAML frontmatter. Values are loosely typed because legacy notes carry
// freeform fields; the well-known keys are surfaced explicitly.
export interface Frontmatter {
  workstream?: Workstream | string;
  type?: string;
  status?: string;
  created?: string;
  date?: string;
  // Everything parsed, including unknown/legacy keys.
  raw: Record<string, unknown>;
}

// A resolved wikilink: [[Target]] / [[Target|Alias]] / [[path/Target|Alias]].
export interface Wikilink {
  target: string; // full target as written, e.g. "memory/people/Scott"
  basename: string; // display basename, e.g. "Scott"
  alias?: string; // explicit alias if present
  display: string; // alias ?? basename
}

export interface Task {
  done: boolean;
  title: string;
  fields: Record<string, string>; // raw inline [key:: value] strings
  description: string;
  notes: string;
  // Resolved/typed conveniences derived from fields + frontmatter.
  workstream?: Workstream | string;
  customer?: Wikilink | "internal";
  due?: string;
  priority?: Priority;
  created?: string;
  scheduled?: string;
  draft?: Wikilink;
  thread?: string;
  taskStatus?: string; // waiting | blocked | someday
  completed?: string;
  // Write-back coordinates.
  sourceFile: string;
  sourceLine: number; // 0-based line index of the checkbox line
}

// Meeting action item under "## Action Items" (dual-capture).
export interface ActionItem {
  done: boolean;
  // When this is Jordan's item it carries a field row and becomes a real task.
  isJordans: boolean;
  owner?: string; // "Zoya" for others-capture, "Jordan" for Jordan's
  text: string; // the action text, owner prefix stripped
  due?: string; // due date/text: Jordan's from [due::], others from "🗓️ Due:"
  task?: Task; // present when isJordans (full parsed task)
  sourceFile: string;
  sourceLine: number;
}

export interface MeetingNote {
  path: string;
  frontmatter: Frontmatter;
  title: string;
  date?: string;
  customer?: Wikilink;
  attendees: string[];
  series?: string;
  topic?: string;
  granolaId?: string;
  // Canonical sections: "TL;DR", "Action Items", "Key Decisions",
  // "Numbers That Matter", "Watch-Outs", "Full Notes" (legacy notes may differ).
  sections: Record<string, string>;
  actionItems: ActionItem[];
}

export interface MeetingsIndexRow {
  date: string;
  bucket: string;
  title: string;
  noteBasename: string; // resolved from [[basename]]
}

// A Merit customer account, parsed from 300 Merit/Customers/<Name>.md.
export interface AccountContact {
  name: string;
  detail?: string; // raw free text after the name (legacy / fallback)
  title?: string; // role / title (parsed out of detail)
  email?: string;
  phone?: string;
}

export interface Account {
  slug: string; // url-safe id derived from the name
  name: string; // display name
  path: string; // vault-relative source path
  workstream: string;
  type?: string; // "OEM Account", "customer", etc. (tolerate freeform)
  region?: string;
  stage?: string;
  status?: string;
  accountNumber?: string; // NEW field, written back to frontmatter (account_number)
  overview?: string;
  situations: string[]; // titles/summaries under "## Active Situations"
  contacts: AccountContact[];
  links: string[]; // wikilink basenames under "## Links"
}

export type RosterClass = "merit" | "customer";

export interface RosterEntry {
  name: string;
  classification: RosterClass;
  account?: string; // for customer contacts, the [[Account]] they belong to
}

export type Roster = Map<string, RosterEntry>;
