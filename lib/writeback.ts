import { getFile, writeFile } from "@/lib/github";
import { todayISO } from "@/lib/dates";

// Mutations that write back into the vault as small, atomic git commits.
// Each reads the latest file first (writeFile re-reads the SHA), never
// force-pushes, and changes exactly one thing (CLAUDE.md rules 2 and 3).

export class WriteBackError extends Error {}

const CHECKBOX = /^(\s*)- \[( |x|X)\] (.*)$/;

// Mark a task done in its source file: flip `- [ ]` to `- [x]` on the given
// line and stamp `[completed:: YYYY-MM-DD]`. Idempotent if already done.
export async function completeTask(
  sourceFile: string,
  sourceLine: number,
  done = true,
): Promise<{ commitSha: string; path: string }> {
  const file = await getFile(sourceFile);
  if (!file) throw new WriteBackError(`Source file not found: ${sourceFile}`);

  const lines = file.content.replace(/\r\n/g, "\n").split("\n");
  const line = lines[sourceLine];
  const m = line?.match(CHECKBOX);
  if (!m) {
    throw new WriteBackError(
      "The task line moved since it was loaded. Refresh and try again.",
    );
  }

  const [, indent, mark, rest] = m;
  const isDone = mark.toLowerCase() === "x";
  if (isDone === done) {
    return { commitSha: "", path: sourceFile }; // already in desired state
  }

  let text = rest;
  const today = todayISO();
  if (done) {
    if (!/\[completed::/.test(text)) text = `${text} [completed:: ${today}]`;
  } else {
    text = text.replace(/\s*\[completed::[^\]]*\]/g, "").trimEnd();
  }
  lines[sourceLine] = `${indent}- [${done ? "x" : " "}] ${text}`;

  const title = rest.replace(/\[[^\]]*\]/g, "").trim().slice(0, 50);
  const verb = done ? "complete" : "reopen";
  return writeFile({
    path: sourceFile,
    content: lines.join("\n"),
    message: `app: ${verb} task ${title} ${today}`,
  });
}

// Set (or clear) the account_number frontmatter field on a customer note.
export async function setAccountNumber(
  path: string,
  accountNumber: string,
): Promise<{ commitSha: string; path: string }> {
  const file = await getFile(path);
  if (!file) throw new WriteBackError(`Account note not found: ${path}`);

  const value = accountNumber.trim();
  const lines = file.content.replace(/\r\n/g, "\n").split("\n");

  // Find the frontmatter fence range.
  if (lines[0]?.trim() !== "---") {
    // No frontmatter: prepend a minimal block.
    const block = ["---", `account_number: ${yaml(value)}`, "---", ""];
    return commitNote(path, [...block, ...lines].join("\n"), value);
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) throw new WriteBackError("Malformed frontmatter (no close).");

  const idx = lines
    .slice(0, close)
    .findIndex((l) => /^account_number\s*:/.test(l));
  if (idx >= 0) {
    if (value) lines[idx] = `account_number: ${yaml(value)}`;
    else lines.splice(idx, 1); // clearing removes the line
  } else if (value) {
    lines.splice(close, 0, `account_number: ${yaml(value)}`);
  }

  return commitNote(path, lines.join("\n"), value);
}

function commitNote(path: string, content: string, value: string) {
  const name = path.split("/").pop()!.replace(/\.md$/, "");
  const action = value ? `set account number` : `clear account number`;
  return writeFile({
    path,
    content,
    message: `app: ${action} for ${name} ${todayISO()}`,
  });
}

function yaml(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
