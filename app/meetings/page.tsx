import Link from "next/link";
import {
  vaultConfigured,
  getAllMeetings,
  getMeetingNoteByPath,
  getRoster,
  getSeriesList,
  getSeriesByPath,
  getSeriesCandidates,
  getSeriesView,
  classifyName,
} from "@/lib/vault";
import {
  dominantBucket,
  seriesFolderForBucket,
  defaultParticipants,
} from "@/lib/vault/seriesCreate";
import { indexRowFromPath } from "@/lib/meetingFormat";
import type { Roster } from "@/lib/vault/types";
import PersonLink from "@/components/PersonLink";
import MeetingClassifier from "@/components/MeetingClassifier";
import { personNameMatches } from "@/lib/vault/people";
import SetupNotice from "@/components/SetupNotice";
import PullFromGranola from "@/components/PullFromGranola";
import ProposalQueue, { type QueueProposal } from "@/components/ProposalQueue";
import { listProposals } from "@/lib/proposals/store";
import type { MeetingFilePayload, SeriesUpdatePayload } from "@/lib/proposals/types";
import MeetingsHub from "@/components/MeetingsHub";
import { granolaConfigured } from "@/lib/granola";
import { meetingNoteToEditable } from "@/lib/meetingEdit";
import { listAccounts } from "@/lib/accounts";
import MeetingEditor from "@/components/MeetingEditor";
import MeetingShareButtons from "@/components/MeetingShareButtons";
import SyncContactsButton from "@/components/SyncContactsButton";
import { todayISO, formatDateMDY } from "@/lib/dates";
import TaskRow from "@/components/TaskRow";
import { workstreamFromPath } from "@/lib/taskView";
import { resolveBrandKit, brandToCssVars } from "@/lib/branding";
import {
  meetingToDoc,
  seriesToDoc,
  MeetingDoc,
  docTheme,
  paperCssVars,
  type DocPerson,
  type DocAction,
} from "@/lib/meetingTemplate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string; series?: string; edit?: string }>;
}) {
  if (!vaultConfigured()) {
    return (
      <Shell>
        <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />
      </Shell>
    );
  }

  const sp = await searchParams;
  if (sp.note && sp.edit) {
    return <EditMeeting path={sp.note} />;
  }
  if (sp.note) {
    return <MeetingDetail path={sp.note} />;
  }
  if (sp.series) {
    return <SeriesDetail path={sp.series} />;
  }

  // Every meeting ever pulled (not the curated 30-row index), so nothing drops
  // off the list as new meetings come in.
  let rows: { date: string; bucket: string; title: string; notePath: string | null }[] = [];
  let error: string | null = null;
  try {
    const all = await getAllMeetings();
    rows = all.map((m) => ({
      date: m.date ?? "",
      bucket: indexRowFromPath(m.path)?.bucket ?? m.customer?.display ?? "Internal",
      title: m.title,
      notePath: m.path,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read meetings.";
  }
  const seriesList = await getSeriesList().catch(() => []);
  const candidates = await getSeriesCandidates().catch(() => []);
  const accounts = await listAccounts().catch(() => []);

  // AI proposals awaiting review (Granola filings + series updates). The queue
  // is the only path from staged AI output to a vault write.
  const pendingProposals = await listProposals("pending").catch(() => []);
  const queueItems: QueueProposal[] = pendingProposals.map((p) => {
    const isMeeting = p.kind === "meeting-file";
    const mp = isMeeting ? (p.payload as MeetingFilePayload) : null;
    const spd = !isMeeting ? (p.payload as SeriesUpdatePayload) : null;
    return {
      id: p.id,
      kind: p.kind,
      parentId: p.parentId,
      summary: p.summary,
      model: p.model,
      createdAt: p.createdAt.toISOString(),
      path: mp?.path ?? spd?.seriesPath ?? null,
      content: mp?.content ?? (spd ? seriesPreview(spd) : null),
      contactsToAdd: mp?.contactsToAdd
        ? { accountName: mp.contactsToAdd.accountName, names: mp.contactsToAdd.names }
        : null,
    };
  });

  return (
    <div>
      {granolaConfigured() && (
        <div className="mb-4 flex justify-end">
          <PullFromGranola />
        </div>
      )}
      <ProposalQueue proposals={queueItems} />
      {error ? (
        <div className="card max-w-2xl border-danger/30 p-5 text-sm text-danger">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="card max-w-2xl p-8 text-center">
          <div className="text-sm font-medium text-fg">No meetings yet</div>
          <p className="mt-1 text-sm text-muted">
            No meeting notes found under the vault&apos;s Meetings folders.
          </p>
        </div>
      ) : (
        <MeetingsHub
          rows={rows.map((r) => ({
            date: r.date,
            bucket: r.bucket,
            title: r.title,
            notePath: r.notePath,
          }))}
          series={seriesList.map((s) => ({
            name: s.name,
            path: s.path,
            cadence: s.cadence,
            sessions: s.log.length,
            latest: s.updated,
          }))}
          accountNames={accounts.map((a) => a.name)}
          today={todayISO()}
          candidates={candidates.map((c) => {
            const bucket = dominantBucket(c.buckets);
            return {
              key: c.key,
              suggestedName: c.suggestedName,
              isOneOnOne: c.isOneOnOne,
              count: c.count,
              firstDate: c.firstDate,
              lastDate: c.lastDate,
              buckets: c.buckets,
              bucket,
              folder: seriesFolderForBucket(bucket),
              participants: defaultParticipants(c.suggestedName, c.isOneOnOne),
              meetings: c.meetings.map((m) => ({
                date: m.date,
                title: m.title,
                noteBasename: m.noteBasename,
                notePath: m.notePath ?? null,
              })),
            };
          })}
        />
      )}
    </div>
  );
}

/* ============================ Screen 3 — Meeting detail ===================== */

async function MeetingDetail({ path }: { path: string }) {
  let note: Awaited<ReturnType<typeof getMeetingNoteByPath>> = null;
  let roster: Roster = new Map();
  let accounts: Awaited<ReturnType<typeof listAccounts>> = [];
  let error: string | null = null;
  try {
    [note, roster, accounts] = await Promise.all([
      getMeetingNoteByPath(path),
      getRoster().catch(() => new Map() as Roster),
      listAccounts().catch(() => []),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the meeting note.";
  }

  if (error) {
    return (
      <Shell>
        <DetailError message={error} />
      </Shell>
    );
  }
  if (!note) {
    return (
      <Shell>
        <DetailError message={`Note not found at ${path}.`} />
      </Shell>
    );
  }

  const today = todayISO();

  // A person's company for the hover card, aligned with their classification:
  // internal people are Merit, customer contacts get their account, unknown
  // people get nothing (never leak the meeting's customer onto them).
  const companyOf = (person: string): string | undefined => {
    if (personNameMatches(person, "Jordan Francis")) return "Merit Medical";
    const entry = classifyName(roster, person);
    if (entry?.classification === "merit") return "Merit Medical";
    if (entry?.account) return entry.account;
    return undefined;
  };
  const accountHref = (name: string): string | undefined => {
    const a = accounts.find(
      (x) =>
        x.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(x.name.toLowerCase()),
    );
    return a ? `/accounts/${a.slug}` : undefined;
  };

  // The branded document: same client brand (resolved by workstream) the
  // exports use, so all three views are consistent. The brand colors + paper +
  // logo apply to the note body; the app chrome (toolbar, classifier) stays on
  // the app theme above it.
  const brand = await resolveBrandKit(workstreamFromPath(note.path));
  const theme = docTheme(brand);
  const lead = brand.workstreamKey ? brand.name : "Film Room";
  const appModel = meetingToDoc(note, {
    roster,
    accounts,
    eyebrowLead: lead,
    accountHref,
  });

  return (
    <Shell>
      <article className="panel texture mx-auto max-w-5xl overflow-hidden p-6 sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink />
          <div className="flex items-center gap-2">
            <Link
              href={`/meetings?note=${encodeURIComponent(path)}&edit=1`}
              className="btn btn-ghost px-3 py-1 text-xs"
            >
              Edit
            </Link>
            {note.customer && <SyncContactsButton notePath={path} />}
            <MeetingShareButtons path={path} />
          </div>
        </div>

        <div className="mt-3">
          <MeetingClassifier
            path={path}
            current={note.customer?.display ?? null}
            accounts={accounts.map((a) => a.name)}
          />
        </div>

        <div
          className="mt-5 rounded-2xl p-6 sm:p-8"
          style={{
            ...(brandToCssVars(brand) as React.CSSProperties),
            ...(paperCssVars(theme) as React.CSSProperties),
            background: theme.paper,
            color: theme.fg,
            border: `1px solid ${theme.line}`,
          }}
        >
          <MeetingDoc
            model={appModel}
            theme={theme}
            slots={{
              renderPerson: (p: DocPerson) => (
                <PersonLink
                  name={p.name}
                  company={companyOf(p.name)}
                  kind={p.kind}
                  count={p.count}
                />
              ),
              renderJordanAction: (a: DocAction) =>
                a.task ? (
                  <TaskRow task={a.task} today={today} showAccount={false} />
                ) : null,
              renderAbout: (a) =>
                a.href ? (
                  <Link
                    href={a.href}
                    className="chip hover:underline"
                    style={{ borderColor: "var(--line-2)" }}
                  >
                    {a.name} ✓
                  </Link>
                ) : (
                  <span className="chip" style={{ borderColor: "var(--line-2)" }}>
                    {a.name}
                  </span>
                ),
            }}
          />
        </div>
      </article>
    </Shell>
  );
}

/* ============================ Phase C — Edit mode ========================== */

async function EditMeeting({ path }: { path: string }) {
  let note: Awaited<ReturnType<typeof getMeetingNoteByPath>> = null;
  let roster: Roster = new Map();
  let accounts: Awaited<ReturnType<typeof listAccounts>> = [];
  let error: string | null = null;
  try {
    [note, roster, accounts] = await Promise.all([
      getMeetingNoteByPath(path),
      getRoster().catch(() => new Map() as Roster),
      listAccounts().catch(() => []),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the meeting note.";
  }

  if (error) {
    return (
      <Shell>
        <DetailError message={error} />
      </Shell>
    );
  }
  if (!note) {
    return (
      <Shell>
        <DetailError message={`Note not found at ${path}.`} />
      </Shell>
    );
  }

  const rosterNames = Array.from(
    new Set(Array.from(roster.values()).map((r) => r.name)),
  ).sort();
  const accountNames = Array.from(new Set(accounts.map((a) => a.name))).sort();

  return (
    <Shell>
      <MeetingEditor
        path={path}
        initial={meetingNoteToEditable(note)}
        date={note.date}
        rosterNames={rosterNames}
        accountNames={accountNames}
      />
    </Shell>
  );
}

/* ============================ Screen 2 — Rolling Series hub ================= */

async function SeriesDetail({ path }: { path: string }) {
  let series: Awaited<ReturnType<typeof getSeriesByPath>> = null;
  const emptyView: Awaited<ReturnType<typeof getSeriesView>> = {
    outstanding: [],
    closed: [],
    sessions: [],
    stats: { attendance: [], sessions: 0, actionsOpen: 0, actionsClosed: 0, decisions: 0 },
  };
  let view = emptyView;
  let accounts: Awaited<ReturnType<typeof listAccounts>> = [];
  let roster: Roster = new Map();
  let error: string | null = null;
  try {
    series = await getSeriesByPath(path);
    if (series) {
      [view, accounts, roster] = await Promise.all([
        getSeriesView(series).catch(() => emptyView),
        listAccounts().catch(() => []),
        getRoster().catch(() => new Map() as Roster),
      ]);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the series.";
  }

  if (error) {
    return (
      <Shell>
        <DetailError message={error} />
      </Shell>
    );
  }
  if (!series) {
    return (
      <Shell>
        <DetailError message={`Series not found at ${path}.`} />
      </Shell>
    );
  }

  const today = todayISO();
  const companyOf = (person: string): string | undefined => {
    if (personNameMatches(person, "Jordan Francis")) return "Merit Medical";
    const entry = classifyName(roster, person);
    if (entry?.classification === "merit") return "Merit Medical";
    if (entry?.account) return entry.account;
    return undefined;
  };

  const brand = await resolveBrandKit(workstreamFromPath(series.path));
  const theme = docTheme(brand);
  const lead = brand.workstreamKey ? brand.name : "Film Room";
  const appModel = seriesToDoc(series, view, {
    roster,
    accounts,
    eyebrowLead: lead,
  });

  return (
    <Shell>
      <article className="panel texture mx-auto max-w-5xl overflow-hidden p-6 sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink />
          <MeetingShareButtons seriesPath={path} />
        </div>

        <div
          className="mt-5 rounded-2xl p-6 sm:p-8"
          style={{
            ...(brandToCssVars(brand) as React.CSSProperties),
            ...(paperCssVars(theme) as React.CSSProperties),
            background: theme.paper,
            color: theme.fg,
            border: `1px solid ${theme.line}`,
          }}
        >
          <MeetingDoc
            model={appModel}
            theme={theme}
            slots={{
              renderPerson: (p: DocPerson) => (
                <PersonLink
                  name={p.name}
                  company={companyOf(p.name)}
                  kind={p.kind}
                  count={p.count}
                />
              ),
              renderJordanAction: (a: DocAction) =>
                a.task ? (
                  <TaskRow task={a.task} today={today} showAccount={false} />
                ) : null,
              sessionHref: (notePath: string) =>
                `/meetings?note=${encodeURIComponent(notePath)}`,
            }}
          />
        </div>
      </article>
    </Shell>
  );
}

/* ================================ shared bits ============================== */

// Human-readable preview of a staged series update for the review queue.
function seriesPreview(p: SeriesUpdatePayload): string {
  return [
    `Log entry for ${p.meetingTitle} (${formatDateMDY(p.date)}):`,
    ...p.logBullets.map((b) => `- ${b}`),
    "",
    "New Current State:",
    p.currentState,
  ].join("\n");
}

function DetailError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink />
      <div
        className="card mt-4 p-5 text-sm"
        style={{ borderColor: "var(--due)", color: "var(--due-ink)" }}
      >
        {message}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/meetings"
      className="eyebrow inline-flex items-center gap-1 text-muted transition-colors hover:text-[color:var(--accent)]"
    >
      ← All meetings
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
