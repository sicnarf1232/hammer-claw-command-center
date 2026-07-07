// Pure renderers for the deliberate vault export (Phase 2 step 7). The DB is
// the source of truth; these turn DB records back into the canonical vault
// markdown (docs/02). Round-trip tested: render -> existing vault parsers ->
// deep-equal. Meetings and series need no renderer (their rows carry the full
// original markdown).

import type { Account, Task } from "@/lib/vault/types";

function yamlValue(s: string): string {
  return /[:#"'\n]/.test(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
}

// Render an account note in the shape parseAccount reads back. The contact
// separator "—" is the existing vault file contract, not prose copy.
export function renderAccountNote(a: Account): string {
  const fm: string[] = ["---"];
  if (a.type) fm.push(`type: ${yamlValue(a.type)}`);
  if (a.region) fm.push(`region: ${yamlValue(a.region)}`);
  if (a.stage) fm.push(`stage: ${yamlValue(a.stage)}`);
  if (a.status) fm.push(`status: ${yamlValue(a.status)}`);
  if (a.accountNumber) fm.push(`account_number: ${yamlValue(a.accountNumber)}`);
  fm.push(`workstream: ${a.workstream || "merit"}`);
  fm.push("---");

  const contacts = a.contacts.map((c) => {
    const detail = [c.title, c.email, c.phone].filter(Boolean).join(" · ");
    return detail ? `- **${c.name}** — ${detail}` : `- **${c.name}**`;
  });

  const out: string[] = [
    ...fm,
    "",
    `# ${a.name}`,
    "",
    "## Overview",
    ...(a.overview ? ["", a.overview] : [""]),
    "",
    "## Key contacts",
    ...(contacts.length ? ["", ...contacts] : [""]),
    "",
    "## Active Situations",
    ...(a.situations.length ? ["", ...a.situations.map((s) => `- ${s}`)] : [""]),
    "",
    "## Links",
    ...(a.links.length ? ["", ...a.links.map((l) => `- [[${l}]]`)] : [""]),
    "",
  ];
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

// One vault task in the docs/02 format: checkbox line + an indented field
// continuation row (that row is what marks it as a real task in meeting notes).
export function renderTaskLine(t: Task): string {
  const fields: string[] = [];
  if (t.customer && t.customer !== "internal") {
    fields.push(`[customer:: [[${t.customer.basename}]]]`);
  }
  if (t.due) fields.push(`[due:: ${t.due}]`);
  if (t.priority) fields.push(`[priority:: ${t.priority}]`);
  if (t.created) fields.push(`[created:: ${t.created}]`);
  if (t.scheduled) fields.push(`[scheduled:: ${t.scheduled}]`);
  if (t.taskStatus) fields.push(`[status:: ${t.taskStatus}]`);
  if (t.thread) fields.push(`[thread:: ${t.thread}]`);
  if (t.done && t.completed) fields.push(`[completed:: ${t.completed}]`);
  const head = `- [${t.done ? "x" : " "}] ${t.title}`;
  return fields.length ? `${head}\n    ${fields.join(" ")}` : head;
}

// The one-writer file that app-created tasks export into.
export const CC_TASKS_PATH = "100 Periodics/Command-Center-Tasks.md";

export function renderCommandCenterTasksFile(tasks: Task[]): string {
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  return [
    "---",
    "workstream: merit",
    "---",
    "",
    "# Command Center Tasks",
    "",
    "Tasks created in the Command Center app. This file is written ONLY by the",
    "app's export (one writer); edit these tasks in the app, not here.",
    "",
    "## Open",
    "",
    ...open.map(renderTaskLine),
    "",
    "## Done",
    "",
    ...done.map(renderTaskLine),
    "",
  ].join("\n");
}

// Flip checkbox lines in an existing vault file to match DB done-states.
// Returns null when nothing changed. Same line grammar as completeTask.
const CHECKBOX = /^(\s*)- \[( |x|X)\] (.*)$/;

export function applyDoneStates(
  content: string,
  changes: Array<{ sourceLine: number; done: boolean; completed?: string }>,
): string | null {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let changed = false;
  for (const ch of changes) {
    const line = lines[ch.sourceLine];
    const m = line?.match(CHECKBOX);
    if (!m) continue; // line moved since seeding: skip rather than corrupt
    const [, indent, mark, rest] = m;
    const isDone = mark.toLowerCase() === "x";
    if (isDone === ch.done) continue;
    let text = rest;
    if (ch.done) {
      if (!/\[completed::/.test(text) && ch.completed) {
        text = `${text} [completed:: ${ch.completed}]`;
      }
    } else {
      text = text.replace(/\s*\[completed::[^\]]*\]/g, "").trimEnd();
    }
    lines[ch.sourceLine] = `${indent}- [${ch.done ? "x" : " "}] ${text}`;
    changed = true;
  }
  return changed ? lines.join("\n") : null;
}
