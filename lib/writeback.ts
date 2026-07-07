import {
  getFile,
  writeFile,
  deleteFile,
  listMarkdownFiles,
} from "@/lib/github";
import { todayISO } from "@/lib/dates";
import {
  applyMeetingEdit,
  setMeetingCustomer,
  setMeetingTitleAccount,
  type MeetingEdit,
} from "@/lib/meetingEdit";
import {
  meetingFolder,
  indexRowFromPath,
  rebuildMeetingsIndex,
  sanitizeForFilename,
  type MeetingRow,
} from "@/lib/meetingFormat";
import { slugify } from "@/lib/vault/accounts";
import { setPersonOverride } from "@/lib/vault/roster";

const ROSTER_PATH = "memory/context/merit.md";
import { addContactsToNote, type NewContact } from "@/lib/contactsWrite";
import { applyAccountEdit, type AccountEdit } from "@/lib/accountEdit";
import { cutoverActive } from "@/lib/dbSource";
import {
  dbSetAccountNumber,
  dbCreateAccount,
  dbEditAccountNote,
  dbAddAccountContacts,
} from "@/lib/accountsDb";

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

// Set (or clear) the account number. DB once the cutover is seeded (the vault
// copy follows on the next export); vault commit before that.
export async function setAccountNumber(
  path: string,
  accountNumber: string,
): Promise<{ commitSha: string; path: string }> {
  if (await cutoverActive()) return dbSetAccountNumber(path, accountNumber);
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

// Phase C: edit a meeting note in the app and write it back as one commit.
// Reads the latest file, applies the structured edit (frontmatter attendees +
// customer, the H1/meta preamble, the canonical sections, and the dual-capture
// action items, including clearing [due:: TBD] flags), and commits. The pure
// transform lives in lib/meetingEdit so it is unit-tested without the network.
export async function editMeetingNote(
  path: string,
  edit: MeetingEdit,
): Promise<{ commitSha: string; path: string }> {
  const file = await getFile(path);
  if (!file) throw new WriteBackError(`Meeting note not found: ${path}`);

  const next = applyMeetingEdit(file.content, edit);
  if (next === file.content.replace(/\r\n/g, "\n").replace(/\n*$/, "\n")) {
    return { commitSha: "", path }; // no-op edit
  }

  const name = path.split("/").pop()!.replace(/\.md$/, "");
  return writeFile({
    path,
    content: next,
    message: `app: edit meeting note ${name} ${todayISO()}`,
  });
}

const MEETINGS_INDEX_PATH = "100 Periodics/Meetings-Index.md";

// Set a person's authoritative classification (internal vs customer) and, for
// customers, their account, by writing a Team Override into the roster. This is
// the in-app "edit person" action; it then drives colors, contact grouping, and
// company labels everywhere on the next read.
export async function setPersonClassification(
  name: string,
  classification: "merit" | "customer",
  account: string | null,
): Promise<{ commitSha: string }> {
  const clean = name.trim();
  if (!clean) throw new WriteBackError("A person name is required.");
  const file = await getFile(ROSTER_PATH);
  if (!file) throw new WriteBackError(`Roster not found: ${ROSTER_PATH}`);

  const next = setPersonOverride(
    file.content,
    clean,
    classification,
    classification === "customer" ? account ?? undefined : undefined,
  );
  if (next === file.content.replace(/\r\n/g, "\n")) {
    return { commitSha: "" };
  }
  const res = await writeFile({
    path: ROSTER_PATH,
    content: next,
    message: `app: set ${clean} = ${classification}${account && classification === "customer" ? ` (${account})` : ""}`,
  });
  return { commitSha: res.commitSha };
}

// Create a minimal customer account note (300 Merit/Customers/<Name>.md) so a
// meeting can be linked to a brand-new account. Returns the slug for redirect.
export async function createAccount(
  name: string,
): Promise<{ path: string; slug: string; created: boolean }> {
  const clean = name.trim();
  if (!clean) throw new WriteBackError("An account name is required.");
  if (await cutoverActive()) return dbCreateAccount(clean);
  const fileBase = sanitizeForFilename(clean) || clean;
  const path = `300 Merit/Customers/${fileBase}.md`;
  const slug = slugify(fileBase);
  if (await getFile(path)) return { path, slug, created: false }; // already exists

  const content = [
    "---",
    "type: Customer",
    "status: Prospect",
    "workstream: merit",
    `created: ${todayISO()}`,
    "---",
    "",
    `# ${clean}`,
    "",
    "## Overview",
    "",
    "## Key contacts",
    "",
    "## Active Situations",
    "",
    "## Links",
    "",
  ].join("\n");
  await writeFile({ path, content, message: `app: create account ${clean}` });
  return { path, slug, created: true };
}

// Full reclassification: set/clear the customer link AND propagate it so the
// whole app follows. Updates frontmatter + the H1 suffix, moves the note into
// the correct folder (customer folder, or Internal when cleared), and rebuilds
// the meetings index so the list name, badges, and links all update. account =
// null marks the note internal. Returns the (possibly new) path.
export async function reclassifyMeeting(
  path: string,
  account: string | null,
): Promise<{ commitSha: string; path: string; moved: boolean }> {
  const file = await getFile(path);
  if (!file) throw new WriteBackError(`Meeting note not found: ${path}`);

  let content = setMeetingCustomer(file.content, account);
  content = setMeetingTitleAccount(content, account);

  // Decide the destination folder. These notes are all the merit workstream.
  const filename = path.split("/").pop()!;
  const folder = meetingFolder("merit", account, account ? undefined : "Internal");
  const newPath = `${folder}/${filename}`;

  const moved = newPath !== path;
  const res = await writeFile({
    path: newPath,
    content,
    message: `app: ${account ? `link ${account}` : "mark internal"} ${filename.replace(/\.md$/, "")}`,
  });
  if (moved) {
    await deleteFile({ path, message: `app: move ${filename} to ${folder}` });
  }

  // Rebuild the index from the post-move file list so the list/buckets follow.
  await rebuildIndex();

  return { commitSha: res.commitSha, path: newPath, moved };
}

async function rebuildIndex(): Promise<void> {
  const indexFile = await getFile(MEETINGS_INDEX_PATH);
  if (!indexFile) return;
  const files = await listMarkdownFiles();
  const rows = files
    .map((f) => indexRowFromPath(f.path))
    .filter((r): r is MeetingRow => r !== null);
  const stamp = `${todayISO()} (app reclassify: ${rows.length} meetings indexed)`;
  const updated = rebuildMeetingsIndex(indexFile.content, rows, stamp);
  if (updated !== indexFile.content) {
    await writeFile({
      path: MEETINGS_INDEX_PATH,
      content: updated,
      message: `app: rebuild meetings index ${todayISO()}`,
    });
  }
}

// Milestone 2: edit an account note in-app (frontmatter fields, overview, and
// the structured contacts list) and write it back as one commit. The pure
// transform lives in lib/accountEdit.
export async function editAccountNote(
  accountPath: string,
  edit: AccountEdit,
): Promise<{ commitSha: string; path: string }> {
  if (await cutoverActive()) return dbEditAccountNote(accountPath, edit);
  const file = await getFile(accountPath);
  if (!file) throw new WriteBackError(`Account note not found: ${accountPath}`);

  const next = applyAccountEdit(file.content, edit);
  if (next === file.content.replace(/\r\n/g, "\n").replace(/\n*$/, "\n")) {
    return { commitSha: "", path: accountPath };
  }

  const name = accountPath.split("/").pop()!.replace(/\.md$/, "");
  return writeFile({
    path: accountPath,
    content: next,
    message: `app: edit account ${name} ${todayISO()}`,
  });
}

// Phase B: add customer contacts to an account note's contacts section as one
// commit. Idempotent: already-present contacts are skipped (added is empty and
// no commit is made). The pure transform lives in lib/contactsWrite.
export async function addAccountContacts(
  accountPath: string,
  contacts: NewContact[],
): Promise<{ commitSha: string; path: string; added: string[] }> {
  if (await cutoverActive()) return dbAddAccountContacts(accountPath, contacts);
  const file = await getFile(accountPath);
  if (!file) throw new WriteBackError(`Account note not found: ${accountPath}`);

  const { content, added } = addContactsToNote(file.content, contacts);
  if (added.length === 0) return { commitSha: "", path: accountPath, added };

  const name = accountPath.split("/").pop()!.replace(/\.md$/, "");
  const res = await writeFile({
    path: accountPath,
    content,
    message: `app: add ${added.length} contact${added.length === 1 ? "" : "s"} to ${name} ${todayISO()}`,
  });
  return { ...res, added };
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
