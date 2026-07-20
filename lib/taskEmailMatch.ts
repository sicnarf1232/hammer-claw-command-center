import { extractKeywords } from "@/lib/firehose/suggest";

// Pure task<->email matching (dev-feedback #11): given an open task and an
// inbound email, score how plausible it is that the email completes or
// relates to the task, with a short human-readable WHY for each signal.
// Suggestion-only: this never decides anything by itself. Every candidate
// still needs Jordan's confirmation before it becomes a stored task_emails
// link (see lib/taskEmailLinks.ts), per CLAUDE.md's hard rule that AI output
// never becomes canonical fact without his say-so.

export interface MatchableTask {
  id: string; // TaskView id (sourceFile:sourceLine, or db:tasks:<id>)
  title: string;
  description?: string | null;
  notes?: string | null;
  customer?: string | null; // account display name, or "internal"
}

export interface MatchableEmail {
  accountName?: string | null;
  subject: string;
  bodyText: string;
  fromName?: string | null;
  fromEmail?: string | null;
}

export interface ScoredMatch {
  score: number;
  reasons: string[];
}

export interface TaskEmailMatch extends ScoredMatch {
  taskId: string;
}

export interface EmailMatch extends ScoredMatch {
  // Identity is caller-supplied (an email row id in practice); kept generic
  // so the pure scorer has no DB dependency.
  emailKey: string;
}

// Alphanumeric, part-number-shaped tokens: mixed letters/digits or digit runs
// of at least 3, e.g. "1234", "PN-1234", "MSS031", "AB-2201-R2". Plain words
// and short numbers (page counts, single digits) are excluded by requiring at
// least one digit and a minimum length.
const PART_NUMBER_RE = /\b[A-Za-z]{0,4}-?\d{2,8}[A-Za-z0-9-]{0,10}\b/g;

// Numbers that read as part numbers by shape but are almost always something
// else (a year, a short count) and would otherwise spam false-positive
// matches between unrelated threads.
const PART_NUMBER_STOPLIST = new Set([
  "2024", "2025", "2026", "2027", "2028",
]);

export function extractPartNumberTokens(text: string): string[] {
  const matches = text.match(PART_NUMBER_RE) ?? [];
  return Array.from(
    new Set(
      matches
        .map((m) => m.toUpperCase())
        .filter((m) => /\d/.test(m) && m.replace(/-/g, "").length >= 3)
        .filter((m) => !PART_NUMBER_STOPLIST.has(m)),
    ),
  );
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

// A name mentioned by whole word in the task's own text: "Scott" matches
// "talk to Scott about..." but not "Scotts Valley". Guards against the
// fromEmail local part being too short/generic to be a useful signal.
function nameAppearsInText(name: string, text: string): boolean {
  const n = name.trim();
  if (n.length < 3) return false;
  const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return re.test(text);
}

function senderFirstName(email: MatchableEmail): string | null {
  const fromName = email.fromName?.trim();
  if (fromName) {
    const first = fromName.split(/\s+/)[0]?.replace(/[.,]/g, "");
    if (first && first.length >= 3) return first;
  }
  const local = email.fromEmail?.split("@")[0];
  if (local) {
    const first = local.split(/[._-]+/)[0];
    if (first && first.length >= 3) return first;
  }
  return null;
}

// The shared scorer: every directional matcher below (task->candidates,
// email->candidates) runs through this one function so the signals and their
// weights live in exactly one place.
export function scoreTaskEmailPair(task: MatchableTask, email: MatchableEmail): ScoredMatch {
  const reasons: string[] = [];
  let score = 0;

  const taskText = `${task.title} ${task.description ?? ""} ${task.notes ?? ""}`;
  const emailText = `${email.subject} ${email.bodyText}`;

  // Signal 1: same account/customer. Internal tasks never match on account
  // (there is no customer to line up).
  const taskAccount = norm(task.customer);
  const emailAccount = norm(email.accountName);
  if (taskAccount && taskAccount !== "internal" && emailAccount && taskAccount === emailAccount) {
    score += 4;
    reasons.push(`Same account as this task (${task.customer}).`);
  }

  // Signal 2: shared part-number-shaped tokens. The strongest single content
  // signal, since a part number pinpoints the exact thing the task is about.
  const taskParts = new Set(extractPartNumberTokens(taskText));
  const emailParts = extractPartNumberTokens(emailText);
  const sharedParts = emailParts.filter((p) => taskParts.has(p)).slice(0, 2);
  if (sharedParts.length) {
    score += 3 * sharedParts.length;
    reasons.push(
      sharedParts.length === 1
        ? `Mentions part number ${sharedParts[0]}, which the task also names.`
        : `Mentions part numbers ${sharedParts.join(", ")}, which the task also names.`,
    );
  }

  // Signal 3: sender named in the task. An internal engineer replying to a
  // request the task text names by first name is a strong completion signal
  // even with no shared keywords (e.g. "ask Scott for the drawing").
  const first = senderFirstName(email);
  if (first && nameAppearsInText(first, taskText)) {
    score += 3;
    reasons.push(`${first} is named in this task, and the email is from ${first}.`);
  }

  // Signal 4: generic keyword overlap (reuses the same extractor as the
  // existing thread->task Smart Action suggestions).
  const taskWords = new Set(extractKeywords(taskText));
  const emailWords = extractKeywords(emailText);
  const sharedWords = emailWords.filter((w) => taskWords.has(w)).slice(0, 3);
  if (sharedWords.length) {
    score += sharedWords.length;
    reasons.push(
      sharedWords.length === 1
        ? `Shares the word "${sharedWords[0]}" with the task.`
        : `Shares words with the task: ${sharedWords.join(", ")}.`,
    );
  }

  return { score, reasons };
}

// Given one inbound email, rank the open tasks it might complete. This is the
// primary direction (thread view: "this email may complete...").
export function matchTasksForEmail(
  tasks: MatchableTask[],
  email: MatchableEmail,
  limit = 5,
): TaskEmailMatch[] {
  return tasks
    .map((t) => ({ taskId: t.id, ...scoreTaskEmailPair(t, email) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Given one open task, rank a set of candidate emails (e.g. recent inbound
// mail) that might complete it. Secondary direction: surfaced on the tasks
// page so the suggestion is visible there too, not just in the inbox.
export function matchEmailsForTask(
  task: MatchableTask,
  emails: { key: string; email: MatchableEmail }[],
  limit = 5,
): EmailMatch[] {
  return emails
    .map(({ key, email }) => ({ emailKey: key, ...scoreTaskEmailPair(task, email) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
