import {
  granolaConfigured,
  GranolaNotConfiguredError,
  listNotesCreatedAfter,
  getNote,
  type GranolaNote,
} from "@/lib/granola";
import {
  getFile,
  listMarkdownFiles,
  readFiles,
  writeFile,
} from "@/lib/github";
import { vaultConfigured, parseMeetingsIndex, getRoster } from "@/lib/vault";
import { classifyName } from "@/lib/vault/roster";
import type { Roster } from "@/lib/vault/types";
import {
  parseSeriesDoc,
  matchesSeries,
  applyMeetingToSeries,
  mmdd,
  SERIES_DIR_MARKER,
  type Series,
} from "@/lib/vault/series";
import { listAccounts } from "@/lib/accounts";
import { resolveAttendees } from "@/lib/contacts";
import { addAccountContacts } from "@/lib/writeback";
import {
  triageMeeting,
  updateSeries,
  type TriagedMeeting,
  type TriagedActionItem,
  type OwnerClass,
} from "@/lib/ai";
import {
  meetingBasename,
  meetingFolder,
  renderMeetingNote,
  rebuildMeetingsIndex,
  indexRowFromPath,
  type MeetingRow,
} from "@/lib/meetingFormat";
import { appTimezone, todayISO } from "@/lib/dates";

const MEETINGS_INDEX_PATH = "100 Periodics/Meetings-Index.md";
// Safety bound on a single pull (first pull on an empty index could be large).
const MAX_PER_PULL = 50;
// Soft wall-clock budget per request. Serverless has a hard cap (60s on Vercel
// Hobby), so we stop starting new meetings well before it and return partial
// progress with `truncated: true`. The user (or cron) just runs it again.
const SOFT_BUDGET_MS = 45_000;

export interface PullFiled {
  title: string;
  path: string;
  bucket: string;
  workstream: string;
}
export interface PullSkipped {
  title: string;
  reason: string;
}
export interface PullError {
  title: string;
  error: string;
}
export interface PullSeriesUpdate {
  series: string;
  date: string;
}
export interface PullContactsAdded {
  account: string;
  names: string[];
}

export interface PullResult {
  createdAfter: string;
  considered: number;
  truncated: boolean;
  filed: PullFiled[];
  skipped: PullSkipped[];
  errors: PullError[];
  seriesUpdated: PullSeriesUpdate[];
  contactsAdded: PullContactsAdded[];
}

// Pull recent Granola meetings into the vault: triage each into the right
// workstream/account, write the note as a commit, and refresh the index. Filing
// uses AI triage; Jordan reviews the result in /meetings and can move anything.
export async function pullGranolaMeetings(): Promise<PullResult> {
  if (!granolaConfigured()) throw new GranolaNotConfiguredError();
  if (!vaultConfigured()) {
    throw new Error("Vault is not configured (GITHUB_TOKEN / VAULT_REPO).");
  }
  const startedAt = Date.now();

  // 1) Determine the pull window from the newest date already in the index.
  // The window is EXCLUSIVE of the newest indexed day: we only fetch notes
  // created on a later day. This makes re-pulls safe, the app never re-fetches
  // a day it has already filed, so it cannot recreate duplicates even when an
  // existing note (e.g. one filed by another tool) carries a different title or
  // id. The trade-off is no intra-day incremental pull, which fits the daily
  // end-of-day workflow. (Granola created_at approximates the meeting day.)
  const indexFile = await getFile(MEETINGS_INDEX_PATH);
  const indexRows = indexFile ? parseMeetingsIndex(indexFile.content) : [];
  const newestDate = indexRows.reduce(
    (max, r) => (r.date > max ? r.date : max),
    "",
  );
  const createdAfter = newestDate
    ? isoStartOfDayAfter(newestDate)
    : isoDaysAgo(30);

  // 2) List candidates, oldest first so the index ends up newest-first.
  const summaries = (await listNotesCreatedAfter(createdAfter)).sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
  const truncated = summaries.length > MAX_PER_PULL;
  const candidates = summaries.slice(0, MAX_PER_PULL);

  // 3) Context for triage + dedup, loaded once (vault reads are SHA-cached).
  const [roster, accounts, allFiles] = await Promise.all([
    getRoster().catch(() => new Map() as Roster),
    listAccounts().catch(() => []),
    listMarkdownFiles().catch(() => []),
  ]);
  const knownAccounts = accounts.map((a) => a.name);
  const existingBasenames = new Set(
    allFiles
      .filter(
        (f) =>
          f.path.includes("/Meetings/") &&
          !f.path.includes(SERIES_DIR_MARKER),
      )
      .map((f) => basenameOfPath(f.path).toLowerCase()),
  );
  const series = await loadSeries(allFiles);

  const filed: PullFiled[] = [];
  const skipped: PullSkipped[] = [];
  const errors: PullError[] = [];
  const seriesUpdated: PullSeriesUpdate[] = [];
  const contactsAdded: PullContactsAdded[] = [];

  // 4) One note at a time (respects Granola + Anthropic rate limits). Stop
  // starting new meetings once the soft budget is spent so we return cleanly.
  let stoppedEarly = false;
  for (const summary of candidates) {
    if (Date.now() - startedAt > SOFT_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    const label = summary.title ?? summary.id;
    try {
      const note = await getNote(summary.id, false);
      const date = denverDate(meetingStartISO(note));
      const basename = meetingBasename(date, summary.title ?? "Untitled meeting");

      if (existingBasenames.has(basename.toLowerCase())) {
        skipped.push({ title: label, reason: "already in the vault" });
        continue;
      }

      const attendees = attendeeNames(note);
      const triaged = await triageMeeting({
        title: note.title,
        folderNames: (note.folder_membership ?? []).map((f) => f.name),
        attendees: attendees.map((name) =>
          describeAttendee(name, roster),
        ),
        summaryMarkdown: note.summary_markdown ?? note.summary_text ?? null,
        knownAccounts,
        date,
      });
      for (const ai of triaged.actionItems) {
        ai.ownerClass = classifyOwner(ai, roster);
      }

      // Recompute the basename from the cleaned title triage produced.
      const finalBasename = meetingBasename(date, triaged.title);
      if (existingBasenames.has(finalBasename.toLowerCase())) {
        skipped.push({ title: label, reason: "already in the vault" });
        continue;
      }

      // Series membership: a clear match links the note to the series and lets
      // us refresh the rolling doc after the note is filed.
      const matched = findSeries(series, triaged, attendees);
      if (matched) triaged.series = matched.name;

      const folder = meetingFolder(
        triaged.workstream,
        triaged.account,
        triaged.bucket,
      );
      const path = `${folder}/${finalBasename}.md`;
      const content = renderMeetingNote({
        triaged,
        date,
        meetingTime: meetingTimeLabel(note),
        attendees,
        granolaId: note.id,
        webUrl: note.web_url,
        createdISO: todayISO(),
      });

      await writeFile({
        path,
        content,
        message: `app: file Granola meeting ${triaged.title} ${date}`,
      });

      existingBasenames.add(finalBasename.toLowerCase());
      filed.push({
        title: triaged.title,
        path,
        bucket: triaged.bucket,
        workstream: triaged.workstream,
      });

      // Phase B: auto-create missing customer contacts on the account note.
      // Best-effort: a failure here must not fail the meeting filing.
      if (triaged.account) {
        try {
          const acct = accounts.find((a) => a.name === triaged.account);
          if (acct) {
            const toCreate = resolveAttendees(
              attendees,
              acct.contacts.map((c) => c.name),
              roster,
            )
              .filter((r) => r.willCreate)
              .map((r) => ({ name: r.name }));
            if (toCreate.length) {
              const res = await addAccountContacts(acct.path, toCreate);
              if (res.added.length) {
                // Keep the in-memory account current so a second meeting in the
                // same pull does not re-add the same people.
                acct.contacts.push(...res.added.map((name) => ({ name })));
                contactsAdded.push({ account: acct.name, names: res.added });
              }
            }
          }
        } catch (e) {
          errors.push({
            title: `contacts: ${triaged.account}`,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Update the rolling-series doc if this meeting belongs to one.
      if (matched) {
        try {
          const upd = await updateSeries({
            seriesName: matched.name,
            cadence: matched.cadence,
            currentState: matched.currentState,
            meetingTitle: triaged.title,
            meetingDate: date,
            meetingSummary: seriesSummary(triaged),
          });
          const newContent = applyMeetingToSeries(
            matched,
            {
              date,
              title: triaged.title,
              bullets: upd.logBullets,
              meetingBasename: finalBasename,
            },
            upd.currentState,
            mmdd(date),
          );
          await writeFile({
            path: matched.path,
            content: newContent,
            message: `app: update series ${matched.name} ${date}`,
          });
          // Refresh in memory so a second meeting in the same pull stacks on it.
          Object.assign(matched, parseSeriesDoc(newContent, matched.path));
          seriesUpdated.push({ series: matched.name, date });
        } catch (e) {
          errors.push({
            title: `series: ${matched.name}`,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } catch (err) {
      errors.push({
        title: label,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5) Rebuild the index from the actual meeting files on disk. This always
  // runs (even when nothing new filed) so it self-heals a stale index left by
  // an earlier partial/timed-out pull. Re-list to include this pull's writes.
  if (indexFile) {
    const freshFiles = await listMarkdownFiles().catch(() => allFiles);
    const rows = freshFiles
      .map((f) => indexRowFromPath(f.path))
      .filter((r): r is MeetingRow => r !== null);
    const stamp = `${todayISO()} (app Granola pull: ${filed.length} new, ${rows.length} meetings indexed)`;
    const updated = rebuildMeetingsIndex(indexFile.content, rows, stamp);
    if (updated !== indexFile.content) {
      await writeFile({
        path: MEETINGS_INDEX_PATH,
        content: updated,
        message: `app: rebuild meetings index ${todayISO()}`,
      });
    }
  }

  return {
    createdAfter,
    considered: candidates.length,
    truncated: truncated || stoppedEarly,
    filed,
    skipped,
    errors,
    seriesUpdated,
    contactsAdded,
  };
}

// ---- helpers ----

async function loadSeries(
  allFiles: { path: string; sha: string; size?: number }[],
): Promise<Series[]> {
  const seriesFiles = allFiles.filter((f) =>
    f.path.includes(SERIES_DIR_MARKER),
  );
  if (!seriesFiles.length) return [];
  const contents = await readFiles(seriesFiles);
  return contents
    .filter(Boolean)
    .map((f) => parseSeriesDoc(f.content, f.path));
}

function findSeries(
  all: Series[],
  t: TriagedMeeting,
  attendees: string[],
): Series | null {
  for (const s of all) {
    if (s.status?.toLowerCase() === "archived") continue;
    if (
      matchesSeries(s, {
        title: t.title,
        attendees,
        topicText: `${t.topic ?? ""} ${t.tldr}`,
      })
    ) {
      return s;
    }
  }
  return null;
}

// Classify an action item's owner against the roster: Jordan is "me" (a real
// task), Merit-internal people are "team", customer contacts are "customer".
function classifyOwner(ai: TriagedActionItem, roster: Roster): OwnerClass {
  if (ai.isJordans || /jordan/i.test(ai.owner ?? "")) return "me";
  const entry = ai.owner ? classifyName(roster, ai.owner) : undefined;
  if (entry?.classification === "merit") return "team";
  if (entry?.classification === "customer") return "customer";
  return "unknown";
}

function seriesSummary(t: TriagedMeeting): string {
  const parts: string[] = [t.tldr];
  const jordans = t.actionItems
    .filter((a) => a.isJordans)
    .map((a) => `- ${a.text}${a.due ? ` (due ${a.due})` : ""}`);
  if (jordans.length) parts.push(`Jordan's open items:\n${jordans.join("\n")}`);
  if (t.decisions.length) {
    parts.push(`Decisions:\n${t.decisions.map((d) => `- ${d}`).join("\n")}`);
  }
  if (t.numbers.length) {
    parts.push(`Numbers:\n${t.numbers.map((d) => `- ${d}`).join("\n")}`);
  }
  if (t.watchouts.length) {
    parts.push(`Watch-outs:\n${t.watchouts.map((d) => `- ${d}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

function meetingStartISO(note: GranolaNote): string {
  return note.calendar_event?.scheduled_start_time ?? note.created_at;
}

function meetingTimeLabel(note: GranolaNote): string | null {
  const iso = note.calendar_event?.scheduled_start_time;
  return iso ? denverTime(iso) : null;
}

function attendeeNames(note: GranolaNote): string[] {
  const fromAttendees = (note.attendees ?? [])
    .map((a) => a.name?.trim() || localPart(a.email))
    .filter(Boolean);
  if (fromAttendees.length) return dedupe(fromAttendees);
  // Fall back to calendar invitees when attendees are not captured.
  const invitees = (note.calendar_event?.invitees ?? []).map((i) =>
    localPart(i.email),
  );
  return dedupe(invitees.filter(Boolean));
}

function describeAttendee(name: string, roster: Roster): string {
  const entry = classifyName(roster, name);
  if (!entry) return `${name} [unknown]`;
  if (entry.classification === "customer") {
    return `${name} [customer${entry.account ? `:${entry.account}` : ""}]`;
  }
  return `${name} [${entry.classification}]`;
}

function localPart(email: string): string {
  return (email ?? "").split("@")[0] ?? "";
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function basenameOfPath(path: string): string {
  return path.split("/").pop()!.replace(/\.md$/, "");
}

function denverDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function denverTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: appTimezone(),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(iso));
}

function isoDaysAgo(days: number): string {
  const ms = Date.parse(`${todayISO()}T00:00:00Z`) - days * 86400000;
  return new Date(ms).toISOString();
}

// Start of the day AFTER the given ISO date (UTC). Add an hour cushion so a
// late-evening meeting in Mountain Time (which lands on the next UTC day) on the
// newest indexed day is still treated as already covered, not re-pulled.
function isoStartOfDayAfter(isoDate: string): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) + 24 * 3600000 + 7 * 3600000;
  return new Date(ms).toISOString();
}
