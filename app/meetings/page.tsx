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
import MeetingsHub from "@/components/MeetingsHub";
import { granolaConfigured } from "@/lib/granola";
import { meetingNoteToEditable } from "@/lib/meetingEdit";
import { listAccounts } from "@/lib/accounts";
import MeetingEditor from "@/components/MeetingEditor";
import MeetingShareButtons from "@/components/MeetingShareButtons";
import SyncContactsButton from "@/components/SyncContactsButton";
import { todayISO } from "@/lib/dates";
import TaskRow from "@/components/TaskRow";
import {
  meetingToDoc,
  seriesToDoc,
  MeetingDoc,
  appDocTheme,
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

  return (
    <div>
      {granolaConfigured() && (
        <div className="mb-4 flex justify-end">
          <PullFromGranola />
        </div>
      )}
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

  // In-app document: APP brand, account label as the eyebrow lead, About links
  // live; the account control is the classifier below, so drop the Account meta.
  const appModel = meetingToDoc(note, {
    roster,
    accounts,
    eyebrowLead: note.customer?.display || "Film Room",
    accountHref,
  });
  appModel.meta = appModel.meta.filter((m) => m.label !== "Account");

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
            <MeetingShareButtons path={path} filename={appModel.filenameBase} />
          </div>
        </div>

        <div className="mt-3">
          <MeetingClassifier
            path={path}
            current={note.customer?.display ?? null}
            accounts={accounts.map((a) => a.name)}
          />
        </div>

        <div className="mt-5">
          <MeetingDoc
            model={appModel}
            theme={appDocTheme()}
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

  const appModel = seriesToDoc(series, view, {
    roster,
    accounts,
    eyebrowLead: "Film Room",
  });

  return (
    <Shell>
      <article className="panel texture mx-auto max-w-5xl overflow-hidden p-6 sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink />
          <MeetingShareButtons seriesPath={path} filename={appModel.filenameBase} />
        </div>

        <div className="mt-5">
          <MeetingDoc
            model={appModel}
            theme={appDocTheme()}
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
