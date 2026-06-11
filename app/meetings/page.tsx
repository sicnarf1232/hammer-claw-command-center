import Link from "next/link";
import {
  vaultConfigured,
  getMeetingsIndex,
  getMeetingNoteByPath,
  getRoster,
} from "@/lib/vault";
import type { Roster, ActionItem } from "@/lib/vault/types";
import { Attendee } from "@/components/Attendee";
import { PriorityChip } from "@/components/chips";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  if (!vaultConfigured()) {
    return (
      <Shell>
        <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />
      </Shell>
    );
  }

  const sp = await searchParams;
  if (sp.note) {
    return <MeetingDetail path={sp.note} />;
  }

  let rows: Awaited<ReturnType<typeof getMeetingsIndex>> = [];
  let error: string | null = null;
  try {
    rows = await getMeetingsIndex();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the meetings index.";
  }

  return (
    <Shell subtitle={`${rows.length} meetings in the index`}>
      {error ? (
        <div className="card max-w-2xl p-5 text-sm text-red-700">{error}</div>
      ) : rows.length === 0 ? (
        <div className="card max-w-2xl p-5 text-sm text-slate-600">
          No meetings found in <code>100 Periodics/Meetings-Index.md</code>.
        </div>
      ) : (
        <div className="grid max-w-3xl gap-2">
          {rows.map((r, i) => (
            <div key={`${r.date}-${i}`} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">
                  {r.title}
                </div>
                <div className="text-xs text-slate-500">
                  {r.date} · {r.bucket}
                  {!r.notePath && " · note not found"}
                </div>
              </div>
              {r.notePath ? (
                <Link
                  href={`/meetings?note=${encodeURIComponent(r.notePath)}`}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Open
                </Link>
              ) : (
                <span className="shrink-0 text-xs text-slate-400">missing</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

async function MeetingDetail({ path }: { path: string }) {
  let note: Awaited<ReturnType<typeof getMeetingNoteByPath>> = null;
  let roster: Roster = new Map();
  let error: string | null = null;
  try {
    [note, roster] = await Promise.all([
      getMeetingNoteByPath(path),
      getRoster().catch(() => new Map() as Roster),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the meeting note.";
  }

  if (error) {
    return (
      <Shell>
        <BackLink />
        <div className="card mt-3 max-w-2xl p-5 text-sm text-red-700">{error}</div>
      </Shell>
    );
  }
  if (!note) {
    return (
      <Shell>
        <BackLink />
        <div className="card mt-3 max-w-2xl p-5 text-sm text-slate-600">
          Note not found at <code>{path}</code>.
        </div>
      </Shell>
    );
  }

  const sectionOrder = ["TL;DR", "Notes", "Decisions"];

  return (
    <Shell>
      <BackLink />
      <div className="mt-3 max-w-3xl">
        <h2 className="text-base font-semibold text-slate-900">{note.title}</h2>
        <div className="mt-1 text-sm text-slate-500">
          {note.date}
          {note.customer ? ` · ${note.customer.display}` : ""}
          {note.series ? ` · ${note.series}` : ""}
        </div>

        {note.attendees.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Attendees
            </div>
            <div className="flex flex-wrap gap-1">
              {note.attendees.map((a) => (
                <Attendee key={a} name={a} roster={roster} />
              ))}
            </div>
          </div>
        )}

        {sectionOrder.map((h) =>
          note!.sections[h] ? (
            <Section key={h} heading={h} body={note!.sections[h]} />
          ) : null,
        )}

        <div className="mt-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Action Items
          </div>
          {note.actionItems.length === 0 ? (
            <div className="text-sm text-slate-500">None captured.</div>
          ) : (
            <div className="grid gap-2">
              {note.actionItems.map((ai, i) => (
                <ActionItemRow key={i} item={ai} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function ActionItemRow({ item }: { item: ActionItem }) {
  return (
    <div className="card p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-sm">{item.done ? "☑" : "☐"}</span>
        <div className="min-w-0">
          <div className="text-sm text-slate-800">
            {item.owner && (
              <span className="font-medium text-slate-900">{item.owner}: </span>
            )}
            {item.text}
            {item.isJordans && (
              <span className="ml-2 align-middle">
                <PriorityChip priority={item.task?.priority} />
              </span>
            )}
          </div>
          {item.isJordans ? (
            <div className="mt-0.5 text-xs text-slate-500">
              Jordan{item.task?.customer && item.task.customer !== "internal"
                ? ` · ${item.task.customer.display}`
                : ""}
              {item.task?.due ? ` · due ${item.task.due}` : ""}
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-slate-400">tracking only</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
        {heading}
      </div>
      <div className="whitespace-pre-wrap text-sm text-slate-700">{body}</div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/meetings" className="text-sm text-slate-500 hover:underline">
      ← All meetings
    </Link>
  );
}

function Shell({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div>
      <header className="mb-5">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Meetings
        </h1>
        <p className="text-sm text-slate-500">
          Live from the vault meetings index. Attendees colored Merit vs
          customer. {subtitle}
        </p>
      </header>
      {children}
    </div>
  );
}
