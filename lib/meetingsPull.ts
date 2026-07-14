import {
  granolaConfigured,
  GranolaNotConfiguredError,
  listNotesCreatedAfter,
  getNote,
  type GranolaNote,
} from "@/lib/granola";
import { listMarkdownFiles } from "@/lib/github";
import { vaultConfigured, getMeetingsIndex, getRoster, getSeriesList } from "@/lib/vault";
import { existingMeetingBasenamesFromDb } from "@/lib/meetingsDb";
import { classifyName } from "@/lib/vault/roster";
import type { Roster } from "@/lib/vault/types";
import {
  parseSeriesDoc,
  matchesSeries,
  SERIES_DIR_MARKER,
  type Series,
} from "@/lib/vault/series";
import { listAccounts } from "@/lib/accounts";
import { resolveAttendees } from "@/lib/contacts";
import { dbConfigured } from "@/lib/db";
import {
  triageMeeting,
  updateSeries,
  type TriagedMeeting,
  type TriagedActionItem,
  type OwnerClass,
} from "@/lib/ai";
import {
  matchesNoteTemplate,
  parseTemplatedNote,
  triagedFromTemplate,
} from "@/lib/noteTemplate";
import {
  meetingBasename,
  meetingFolder,
  renderMeetingNote,
} from "@/lib/meetingFormat";
import { appTimezone, todayISO } from "@/lib/dates";
import { stageProposal, latestProposalFor } from "@/lib/proposals/store";
import {
  meetingDedupeKey,
  seriesDedupeKey,
  meetingSummaryLine,
  seriesSummaryLine,
} from "@/lib/proposals/build";
import type {
  MeetingFilePayload,
  SeriesUpdatePayload,
} from "@/lib/proposals/types";

// Safety bound on a single pull (first pull on an empty index could be large).
const MAX_PER_PULL = 50;
// Re-scan this many days before the newest indexed day on every pull, so
// intra-day and late-finalized Granola notes are not stranded. Dedup (vault
// basenames + proposal dedupe keys) makes re-listing already-handled days a
// no-op.
const OVERLAP_DAYS = 4;
// Soft wall-clock budget per request. Serverless has a hard cap (60s on Vercel
// Hobby), so we stop starting new meetings well before it and return partial
// progress with `truncated: true`. The user (or cron) just runs it again.
const SOFT_BUDGET_MS = 45_000;

export interface PullStaged {
  title: string;
  path: string;
  bucket: string;
  workstream: string;
  action: "staged" | "refreshed";
}
export interface PullSkipped {
  title: string;
  reason: string;
}
export interface PullError {
  title: string;
  error: string;
}
export interface PullSeriesStaged {
  series: string;
  date: string;
}

export interface PullResult {
  createdAfter: string;
  considered: number;
  truncated: boolean;
  staged: PullStaged[];
  seriesStaged: PullSeriesStaged[];
  // Pending proposals already staged from an earlier pull (AI not re-run).
  alreadyPending: number;
  skipped: PullSkipped[];
  errors: PullError[];
}

// Stage recent Granola meetings as PROPOSALS: triage each into the right
// workstream/account, render the note, and park everything in ai_proposals for
// Jordan to approve on /meetings. STAGING NEVER WRITES THE VAULT; the approved
// payload is executed by lib/proposals/executeMeeting. A meeting Jordan
// rejected is never re-staged (the proposal latches by granola id).
export async function stageGranolaMeetings(opts?: {
  // Re-run pending proposals through triage and refresh their payloads in
  // place (same row, same children). Used after a triage improvement lands
  // so waiting proposals pick it up; approved/rejected latches still hold.
  refreshPending?: boolean;
}): Promise<PullResult> {
  if (!granolaConfigured()) throw new GranolaNotConfiguredError();
  if (!vaultConfigured()) {
    throw new Error("Vault is not configured (GITHUB_TOKEN / VAULT_REPO).");
  }
  if (!dbConfigured()) {
    throw new Error(
      "Database not configured (POSTGRES_URL). Proposals need the DB; nothing was staged.",
    );
  }
  const startedAt = Date.now();

  // 1) Determine the pull window. We re-scan a rolling overlap of recent days
  // (starting OVERLAP_DAYS before the newest indexed day) rather than jumping
  // past it, so intra-day re-pulls and late-finalized notes are picked up.
  // getMeetingsIndex is DB-first post-cutover.
  const indexRows = await getMeetingsIndex().catch(() => []);
  const newestDate = indexRows.reduce(
    (max, r) => (r.date > max ? r.date : max),
    "",
  );
  const createdAfter = newestDate
    ? isoStartOfDay(newestDate, OVERLAP_DAYS)
    : isoDaysAgo(30);

  // 2) List candidates, oldest first so approvals file in date order.
  const summaries = (await listNotesCreatedAfter(createdAfter)).sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
  const truncated = summaries.length > MAX_PER_PULL;
  const candidates = summaries.slice(0, MAX_PER_PULL);

  // 3) Context for triage + dedup, loaded once. Roster/accounts/series are
  // DB-first accessors post-cutover; basename dedup asks the DB when seeded,
  // else scans the vault file list.
  const [roster, accounts, dbBasenames, seriesFromAccessor] = await Promise.all([
    getRoster().catch(() => new Map() as Roster),
    listAccounts().catch(() => []),
    existingMeetingBasenamesFromDb().catch(() => null),
    getSeriesList().catch(() => [] as Series[]),
  ]);
  const knownAccounts = accounts.map((a) => a.name);
  let existingBasenames: Set<string>;
  if (dbBasenames) {
    existingBasenames = dbBasenames;
  } else {
    const allFiles = await listMarkdownFiles().catch(() => []);
    existingBasenames = new Set(
      allFiles
        .filter(
          (f) =>
            f.path.includes("/Meetings/") &&
            !f.path.includes(SERIES_DIR_MARKER),
        )
        .map((f) => basenameOfPath(f.path).toLowerCase()),
    );
  }
  const series = seriesFromAccessor;

  const staged: PullStaged[] = [];
  const seriesStaged: PullSeriesStaged[] = [];
  const skipped: PullSkipped[] = [];
  const errors: PullError[] = [];
  let alreadyPending = 0;

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
      // Proposal latch FIRST, before spending Granola/AI calls: a pending
      // proposal is left as-is (no AI re-run every pull); approved and
      // rejected ones are never resurrected.
      const prior = await latestProposalFor(
        "meeting-file",
        meetingDedupeKey(summary.id),
      );
      if (prior?.status === "pending" && !opts?.refreshPending) {
        alreadyPending += 1;
        continue;
      }
      if (prior?.status === "approved") {
        skipped.push({ title: label, reason: "previously approved" });
        continue;
      }
      // A rejected meeting comes back ONLY when the Granola note changed
      // after the rejection (Jordan fixed it at the source and re-pulled).
      if (prior?.status === "rejected") {
        const changedSince =
          summary.updated_at &&
          prior.decidedAt &&
          new Date(summary.updated_at) > new Date(prior.decidedAt);
        if (!changedSince) {
          skipped.push({ title: label, reason: "previously rejected" });
          continue;
        }
      }

      const note = await getNote(summary.id, false);
      const date = denverDate(meetingStartISO(note));
      const basename = meetingBasename(date, summary.title ?? "Untitled meeting");

      if (existingBasenames.has(basename.toLowerCase())) {
        skipped.push({ title: label, reason: "already in the vault" });
        continue;
      }

      const attendees = attendeeNames(note);
      const rawSummary = note.summary_markdown ?? note.summary_text ?? null;
      // Less is more (Jordan, 2026-07-09): a note that already follows his
      // template was generated from the raw transcript once; re-parsing it is
      // double work that loses context. Templated notes pass through with
      // ZERO AI; only non-templated notes get one structuring pass, on Opus.
      let triaged: TriagedMeeting;
      if (rawSummary && matchesNoteTemplate(rawSummary)) {
        triaged = triagedFromTemplate(parseTemplatedNote(rawSummary), {
          fallbackTitle: note.title ?? null,
          attendees,
          knownAccounts,
          date,
        });
      } else {
        triaged = await triageMeeting(
          {
            title: note.title,
            folderNames: (note.folder_membership ?? []).map((f) => f.name),
            attendees: attendees.map((name) => describeAttendee(name, roster)),
            summaryMarkdown: rawSummary,
            knownAccounts,
            date,
          },
          { modelChoice: "smart" },
        );
      }
      for (const ai of triaged.actionItems) {
        ai.ownerClass = classifyOwner(ai, roster);
      }

      // Triage may recover attendees named only in the summary text (Granola's
      // structured list is often just who it identified on the call), so
      // prefer its fuller list. Roster matching wants plain names, without
      // the "(Stryker, PMO)" style affiliations the display list keeps.
      const displayAttendees = triaged.attendees.length
        ? triaged.attendees
        : attendees;
      const plainAttendees = dedupe(
        displayAttendees
          .map((a) => a.replace(/\([^)]*\)/g, "").trim())
          .filter(Boolean),
      );

      // Recompute the basename from the cleaned title triage produced.
      const finalBasename = meetingBasename(date, triaged.title);
      if (existingBasenames.has(finalBasename.toLowerCase())) {
        skipped.push({ title: label, reason: "already in the vault" });
        continue;
      }

      // Series membership: a clear match links the note to the series and
      // stages a second, separately-approvable proposal for the rolling doc.
      const matched = findSeries(series, triaged, plainAttendees);
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
        attendees: displayAttendees,
        granolaId: note.id,
        webUrl: note.web_url,
        createdISO: todayISO(),
      });

      // Contacts the meeting surfaced that are missing from the account note;
      // computed now, written only on approval.
      let contactsToAdd: MeetingFilePayload["contactsToAdd"] = null;
      if (triaged.account) {
        const acct = accounts.find((a) => a.name === triaged.account);
        if (acct) {
          const names = resolveAttendees(
            plainAttendees,
            acct.contacts.map((c) => c.name),
            roster,
          )
            .filter((r) => r.willCreate)
            .map((r) => r.name);
          if (names.length) {
            contactsToAdd = {
              accountPath: acct.path,
              accountName: acct.name,
              names,
            };
          }
        }
      }

      const payload: MeetingFilePayload = {
        granolaId: note.id,
        title: triaged.title,
        date,
        path,
        content,
        workstream: triaged.workstream,
        bucket: triaged.bucket,
        account: triaged.account,
        attendees: displayAttendees,
        tldr: triaged.tldr,
        contactsToAdd,
        seriesName: matched?.name ?? null,
      };
      const res = await stageProposal({
        kind: "meeting-file",
        dedupeKey: meetingDedupeKey(note.id),
        payload,
        summary: meetingSummaryLine(payload),
        model: triaged.modelUsed,
        allowRestageRejected: prior?.status === "rejected",
      });
      if (res.action === "staged" || res.action === "refreshed") {
        staged.push({
          title: triaged.title,
          path,
          bucket: triaged.bucket,
          workstream: triaged.workstream,
          action: res.action,
        });
      }

      // Stage the rolling-series refresh alongside (frozen AI output; the
      // deterministic merge runs at approval against a fresh doc read).
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
          const seriesPayload: SeriesUpdatePayload = {
            seriesPath: matched.path,
            seriesName: matched.name,
            cadence: matched.cadence,
            date,
            meetingTitle: triaged.title,
            meetingBasename: finalBasename,
            logBullets: upd.logBullets,
            currentState: upd.currentState,
          };
          await stageProposal({
            kind: "series-update",
            dedupeKey: seriesDedupeKey(matched.path, finalBasename),
            parentId: res.id,
            payload: seriesPayload,
            summary: seriesSummaryLine(seriesPayload),
            model: upd.modelUsed,
          });
          seriesStaged.push({ series: matched.name, date });
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

  return {
    createdAfter,
    considered: candidates.length,
    truncated: truncated || stoppedEarly,
    staged,
    seriesStaged,
    alreadyPending,
    skipped,
    errors,
  };
}

// ---- helpers ----

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
  // Granola's captured list is often just who it identified on the call, so
  // calendar invitees fill in the rest rather than only serving as a fallback.
  const named = (note.attendees ?? [])
    .map((a) => a.name?.trim() || localPart(a.email))
    .filter(Boolean);
  const knownEmails = new Set(
    (note.attendees ?? []).map((a) => a.email?.toLowerCase()).filter(Boolean),
  );
  const namedLower = new Set(named.map((n) => n.toLowerCase()));
  const invitees = (note.calendar_event?.invitees ?? [])
    .filter((i) => i.email && !knownEmails.has(i.email.toLowerCase()))
    .map((i) => localPart(i.email))
    .filter((n) => n && !namedLower.has(n.toLowerCase()));
  return dedupe([...named, ...invitees]);
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

// Start of (isoDate minus backDays), UTC. Used as an inclusive, overlapping
// lower bound for the pull window so recent days are re-scanned.
function isoStartOfDay(isoDate: string, backDays = 0): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) - backDays * 86400000;
  return new Date(ms).toISOString();
}
