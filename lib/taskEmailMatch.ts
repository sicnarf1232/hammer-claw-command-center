import { extractKeywords } from "@/lib/firehose/suggest";

// Pure task<->content matching (dev-feedback #11, generalized for #14 Part 3
// to also cover meeting notes). Given an open task and a piece of content (an
// inbound email, or a meeting note), score how plausible it is that the
// content completes or relates to the task, with a short human-readable WHY
// for each signal. Suggestion-only: this never decides anything by itself.
// Every candidate still needs Jordan's confirmation before it becomes a
// stored task_emails/task_meetings link, per CLAUDE.md's hard rule that AI
// output never becomes canonical fact without his say-so.
//
// dev-feedback #14: Jordan's complaint about the first cut of this feature
// was that "same account" alone surfaced every open task on that account.
// account match and generic keyword overlap now only ever BOOST a ranking;
// they can never by themselves QUALIFY a suggestion to surface. A suggestion
// must have at least one precise signal: a shared part-number token, a named
// person match, or an extracted-intent match (asks/provides text an AI
// extraction pulled out of an email, crossed against the task's own text by
// a plain deterministic phrase-overlap check, see phraseOverlapsText below).

export interface MatchableTask {
  id: string; // TaskView id (sourceFile:sourceLine, or db:tasks:<id>)
  title: string;
  description?: string | null;
  notes?: string | null;
  customer?: string | null; // account display name, or "internal"
  // Structured delegate (dev-feedback #20 item 4), from TaskView.delegatedTo.
  // A named-person match in free text (below) can be the wrong "Scott"; an
  // exact address match against the task's actual delegate cannot, so it
  // qualifies as its own, stronger signal.
  delegateEmail?: string | null;
  delegateName?: string | null;
}

export interface MatchableEmail {
  accountName?: string | null;
  subject: string;
  bodyText: string;
  fromName?: string | null;
  fromEmail?: string | null;
  // Cached AI extraction (lib/emailExtraction.ts), optional: when present,
  // a matching ask/provide phrase is a QUALIFYING signal, not just a boost.
  extractedAsks?: string[] | null;
  extractedProvides?: string[] | null;
}

// Generalized content shape both the email matcher (below) and the meeting
// matcher (lib/taskMeetingMatch.ts) collapse into before scoring, so the
// qualifying-bar logic and weights live in exactly one place.
export interface MatchableContent {
  kind: "email" | "meeting";
  accountName?: string | null;
  text: string; // subject+body, or title+topic+sections collapsed to one blob
  personNames?: string[]; // candidate names to check against the task's text
  extractedAsks?: string[] | null;
  extractedProvides?: string[] | null;
  // Email-only: the sender's address, for the exact delegate-email
  // qualifying signal below. Meetings have no single "from," so this stays
  // undefined for the meeting matcher.
  fromEmail?: string | null;
}

export interface ScoredMatch {
  score: number;
  reasons: string[];
  // A suggestion only ever surfaces when this is true (see the module
  // comment above). Account match and generic keyword overlap alone never
  // set it; they still add to score/reasons as supporting color once
  // something else has qualified the pair.
  qualifies: boolean;
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

// Deterministic phrase-overlap check between an extracted ask/provide phrase
// (short, AI-produced) and a task's own text (title/description/notes). Kept
// pure and dependency-free so it is unit-testable with fake phrases: the
// extraction step is the only AI involvement in this feature, the crossing
// itself never calls a model. A short phrase must match in full (its one
// significant word, at least 5 characters, has to appear); a longer phrase
// qualifies once at least half its significant words appear, so a paraphrase
// still counts without letting one stray shared word through.
export function phraseOverlapsText(phrase: string, text: string): boolean {
  const phraseWords = extractKeywords(phrase);
  if (!phraseWords.length) return false;
  const textWords = new Set(extractKeywords(text));
  const shared = phraseWords.filter((w) => textWords.has(w));
  if (!shared.length) return false;
  if (phraseWords.length === 1) return shared.length === 1 && phraseWords[0].length >= 5;
  return shared.length / phraseWords.length >= 0.5;
}

// The shared scorer (dev-feedback #14 Part 3): both the email matcher below
// and lib/taskMeetingMatch.ts's meeting matcher collapse their content into
// this one shape and run through this one function, so the qualifying-bar
// logic and weights live in exactly one place.
export function scoreTaskContentPair(task: MatchableTask, content: MatchableContent): ScoredMatch {
  const reasons: string[] = [];
  let score = 0;
  let qualifies = false;

  const taskText = `${task.title} ${task.description ?? ""} ${task.notes ?? ""}`;
  const contentText = content.text;
  const sourceLabel = content.kind === "meeting" ? "This meeting" : "This email";

  // Signal: same account/customer. BOOST ONLY, never qualifying on its own,
  // per dev-feedback #14: this was the exact signal that made the first cut
  // of this feature surface every open task on an account.
  const taskAccount = norm(task.customer);
  const contentAccount = norm(content.accountName);
  if (taskAccount && taskAccount !== "internal" && contentAccount && taskAccount === contentAccount) {
    score += 4;
    reasons.push(`Same account as this task (${task.customer}).`);
  }

  // Signal: shared part-number-shaped tokens. QUALIFYING: a part number
  // pinpoints the exact thing the task is about.
  const taskParts = new Set(extractPartNumberTokens(taskText));
  const contentParts = extractPartNumberTokens(contentText);
  const sharedParts = contentParts.filter((p) => taskParts.has(p)).slice(0, 2);
  if (sharedParts.length) {
    score += 3 * sharedParts.length;
    qualifies = true;
    reasons.push(
      sharedParts.length === 1
        ? `Mentions part number ${sharedParts[0]}, which the task also names.`
        : `Mentions part numbers ${sharedParts.join(", ")}, which the task also names.`,
    );
  }

  // Signal: the content's sender is an EXACT match for the task's structured
  // delegate (dev-feedback #20 item 4). QUALIFYING, and stronger than the
  // fuzzy named-person signal just below: "Scott" mentioned in a task's own
  // text could be the wrong Scott, but an exact address match against the
  // task's actual delegate cannot be. This is the concrete "waiting on
  // someone, and they just replied" moment Jordan described.
  if (content.kind === "email" && task.delegateEmail && content.fromEmail) {
    if (norm(task.delegateEmail) === norm(content.fromEmail)) {
      score += 5;
      qualifies = true;
      const who = task.delegateName || "the delegate";
      reasons.push(`This email is from ${who}, who this task is delegated to.`);
    }
  }

  // Signal: a person named in the task's own text also appears as a source
  // of this content (email sender, meeting attendee). QUALIFYING: a strong
  // completion signal even with no shared keywords (e.g. "ask Scott for the
  // drawing").
  for (const name of content.personNames ?? []) {
    if (name && nameAppearsInText(name, taskText)) {
      score += 3;
      qualifies = true;
      reasons.push(
        content.kind === "meeting"
          ? `${name} is named in this task, and ${name} is on this meeting.`
          : `${name} is named in this task, and the email is from ${name}.`,
      );
      break;
    }
  }

  // Signal: extracted intent (dev-feedback #14 Part 2). QUALIFYING: an AI
  // extraction (lib/ai.ts's extractEmailAsks, cached in lib/emailExtraction.ts)
  // pulled a plain-English ask/provide phrase out of the content; this checks
  // it against the task's text with the plain deterministic phraseOverlapsText
  // above, so the crossing itself needs no model call.
  const matchedAsk = (content.extractedAsks ?? []).find((a) => phraseOverlapsText(a, taskText));
  if (matchedAsk) {
    score += 4;
    qualifies = true;
    reasons.push(`${sourceLabel} asks: "${matchedAsk}", which matches the task.`);
  }
  const matchedProvide = (content.extractedProvides ?? []).find((p) => phraseOverlapsText(p, taskText));
  if (matchedProvide) {
    score += 4;
    qualifies = true;
    reasons.push(`${sourceLabel} provides: "${matchedProvide}", which matches the task.`);
  }

  // Signal: generic keyword overlap (reuses the same extractor as the
  // existing thread->task Smart Action suggestions). BOOST ONLY: noisy on
  // its own (see dev-feedback #14), useful once something else qualifies.
  const taskWords = new Set(extractKeywords(taskText));
  const contentWords = extractKeywords(contentText);
  const sharedWords = contentWords.filter((w) => taskWords.has(w)).slice(0, 3);
  if (sharedWords.length) {
    score += sharedWords.length;
    reasons.push(
      sharedWords.length === 1
        ? `Shares the word "${sharedWords[0]}" with the task.`
        : `Shares words with the task: ${sharedWords.join(", ")}.`,
    );
  }

  return { score, reasons, qualifies };
}

// Email-specific wrapper around the shared scorer: collapses an email into
// the generalized MatchableContent shape.
export function scoreTaskEmailPair(task: MatchableTask, email: MatchableEmail): ScoredMatch {
  const first = senderFirstName(email);
  return scoreTaskContentPair(task, {
    kind: "email",
    accountName: email.accountName,
    text: `${email.subject} ${email.bodyText}`,
    personNames: first ? [first] : [],
    extractedAsks: email.extractedAsks,
    extractedProvides: email.extractedProvides,
    fromEmail: email.fromEmail ?? null,
  });
}

// Given one inbound email, rank the open tasks it might complete. This is the
// primary direction (thread view: "this email may complete..."). Only
// QUALIFYING matches surface (see the module comment above); score still
// ranks among them.
export function matchTasksForEmail(
  tasks: MatchableTask[],
  email: MatchableEmail,
  limit = 5,
): TaskEmailMatch[] {
  return tasks
    .map((t) => ({ taskId: t.id, ...scoreTaskEmailPair(t, email) }))
    .filter((m) => m.qualifies)
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
    .filter((m) => m.qualifies)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
