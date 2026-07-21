// Pure logic for the Workflows feature (Main St. AI, dev-feedback #20's
// remaining half): the dedupe rule discovery uses before inserting a
// suggestion, the step sanitizer the API routes run on every write, the
// reorder helper the editor uses, and the evidence normalizer. No DB, no
// framework imports; unit tested in lib/workflowLogic.test.ts. The DB CRUD
// lives in lib/workflows.ts and the discovery corpus in
// lib/workflowDiscovery.ts.

export type WorkflowStatus = "suggested" | "confirmed" | "archived";

export type WorkflowChannel = "email" | "meeting" | "internal" | "other";

export interface WorkflowStep {
  id: string;
  description: string;
  personName?: string | null;
  personId?: number | null;
  channel?: WorkflowChannel | null;
}

export const WORKFLOW_CHANNELS: WorkflowChannel[] = [
  "email",
  "meeting",
  "internal",
  "other",
];

// ---- Dedupe rule (documented) ----------------------------------------------
//
// A discovery re-run must not re-insert a suggestion Jordan already has. The
// v1 rule is a normalized-name comparison:
//   1. lowercase
//   2. strip everything except letters, digits, and spaces
//   3. collapse runs of whitespace
//   4. drop trailing generic words ("workflow", "process", "flow", "handling")
// Two names are duplicates when the normalized forms are equal, OR when one
// contains the other and both are at least 8 characters long (so "quote
// request" matches "quote request workflow" but "po" never swallows
// "post-PO logistics"). Archived workflows do NOT block a re-suggestion:
// dismissing a bad guess should not silence a better version of it forever.

const GENERIC_TAIL = /\s+(workflow|process|flow|handling)$/;

export function normalizeWorkflowName(name: string): string {
  let n = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Strip generic tails repeatedly ("drawing request handling process").
  for (let i = 0; i < 3; i++) {
    const next = n.replace(GENERIC_TAIL, "");
    if (next === n) break;
    n = next;
  }
  return n;
}

export function isDuplicateWorkflowName(
  candidate: string,
  existingNames: string[],
): boolean {
  const c = normalizeWorkflowName(candidate);
  if (!c) return true; // an empty name is never insertable
  for (const existing of existingNames) {
    const e = normalizeWorkflowName(existing);
    if (!e) continue;
    if (c === e) return true;
    if (c.length >= 8 && e.length >= 8 && (c.includes(e) || e.includes(c))) {
      return true;
    }
  }
  return false;
}

// ---- Step sanitation ---------------------------------------------------------
//
// Every write path (create manual, update, discovery insert) runs raw step
// input through this: unknown JSON in, bounded well-formed steps out. Missing
// ids get stable generated ones so the editor can key rows.

const MAX_STEPS = 12;
const MAX_DESC = 300;
const MAX_PERSON = 80;

function isChannel(v: unknown): v is WorkflowChannel {
  return WORKFLOW_CHANNELS.includes(v as WorkflowChannel);
}

export function sanitizeSteps(raw: unknown): WorkflowStep[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkflowStep[] = [];
  for (const item of raw) {
    if (out.length >= MAX_STEPS) break;
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const description =
      typeof o.description === "string" ? o.description.trim().slice(0, MAX_DESC) : "";
    if (!description) continue;
    const personName =
      typeof o.personName === "string" && o.personName.trim()
        ? o.personName.trim().slice(0, MAX_PERSON)
        : null;
    const personId =
      typeof o.personId === "number" && Number.isInteger(o.personId) && o.personId > 0
        ? o.personId
        : null;
    const id =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim().slice(0, 40)
        : `s${out.length + 1}-${description.length}`;
    out.push({
      id,
      description,
      personName,
      personId,
      channel: isChannel(o.channel) ? o.channel : null,
    });
  }
  return out;
}

// ---- Reorder helper (editor's up/down buttons) -------------------------------

export function moveStep(
  steps: WorkflowStep[],
  index: number,
  direction: "up" | "down",
): WorkflowStep[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= steps.length) return steps;
  if (target < 0 || target >= steps.length) return steps;
  const next = steps.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// ---- Evidence normalization ---------------------------------------------------
//
// Evidence rows are the concrete corpus items (thread subjects, task titles)
// that led Main St. AI to suggest a workflow, so Jordan sees WHY. Stored as a
// bounded string array; anything malformed is dropped, never invented.

const MAX_EVIDENCE = 12;
const MAX_EVIDENCE_LEN = 200;

export function normalizeEvidence(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => (typeof e === "string" ? e.trim() : ""))
    .filter((e) => e.length > 0)
    .map((e) => e.slice(0, MAX_EVIDENCE_LEN))
    .slice(0, MAX_EVIDENCE);
}
