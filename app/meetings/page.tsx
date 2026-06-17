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
import PullFromGranola from "@/components/PullFromGranola";
import { granolaConfigured } from "@/lib/granola";

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
            Nothing found in{" "}
            <code className="font-mono">100 Periodics/Meetings-Index.md</code>.
          </p>
        </div>
      ) : (
        <div className="grid max-w-3xl gap-2">
          {rows.map((r, i) => (
            <div
              key={`${r.date}-${i}`}
              className="card flex items-center justify-between gap-3 p-3 transition-shadow hover:shadow-elevated"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">
                  {r.title}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  <span className="font-mono tabular-nums">{r.date}</span> ·{" "}
                  {r.bucket}
                  {!r.notePath && " · note not found"}
                </div>
              </div>
              {r.notePath ? (
                <Link
                  href={`/meetings?note=${encodeURIComponent(r.notePath)}`}
                  className="btn btn-outline shrink-0 cursor-pointer"
                >
                  Open
                </Link>
              ) : (
                <span className="shrink-0 text-xs text-muted">missing</span>
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
        <div className="card mt-3 max-w-2xl border-danger/30 p-5 text-sm text-danger">
          {error}
        </div>
      </Shell>
    );
  }
  if (!note) {
    return (
      <Shell>
        <BackLink />
        <div className="card mt-3 max-w-2xl p-5 text-sm text-muted">
          Note not found at <code className="font-mono">{path}</code>.
        </div>
      </Shell>
    );
  }

  const sectionOrder = ["TL;DR", "Notes", "Decisions"];

  return (
    <Shell>
      <BackLink />
      <div className="mt-3 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-fg">
          {note.title}
        </h2>
        <div className="mt-1 text-sm text-muted">
          <span className="font-mono tabular-nums">{note.date}</span>
          {note.customer ? ` · ${note.customer.display}` : ""}
          {note.series ? ` · ${note.series}` : ""}
        </div>

        {note.attendees.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
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
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Action Items
          </div>
          {note.actionItems.length === 0 ? (
            <div className="text-sm text-muted">None captured.</div>
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
  const customer =
    item.task?.customer && item.task.customer !== "internal"
      ? item.task.customer.display
      : null;
  // Jordan's items get a merit accent edge and chips; others stay quiet.
  const edge = item.isJordans ? "before:bg-merit" : "before:bg-transparent";
  return (
    <div
      className={`card relative overflow-hidden p-3 transition-shadow hover:shadow-elevated before:absolute before:inset-y-0 before:left-0 before:w-1 ${edge}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-sm text-muted">
          {item.done ? "☑" : "☐"}
        </span>
        <div className="min-w-0">
          <div className={item.isJordans ? "text-sm text-fg/90" : "text-sm text-muted"}>
            {item.owner && (
              <span className="font-medium text-fg">{item.owner}: </span>
            )}
            {item.text}
            {item.isJordans && (
              <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
                <PriorityChip priority={item.task?.priority} />
                {customer && <span className="chip">{customer}</span>}
                {item.task?.due && (
                  <span className="chip font-mono tabular-nums">
                    due {item.task.due}
                  </span>
                )}
              </span>
            )}
          </div>
          {item.isJordans ? (
            <div className="mt-0.5 text-xs text-muted">Jordan</div>
          ) : (
            <div className="mt-0.5 text-xs text-muted/70">tracking only</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
        {heading}
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg/75">
        {body}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/meetings"
      className="cursor-pointer text-sm text-muted hover:text-fg hover:underline"
    >
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
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Meetings
        </h1>
        <p className="mt-1 text-sm text-muted">
          Live from the vault meetings index. Attendees colored Merit vs
          customer. {subtitle}
        </p>
      </header>
      {children}
    </div>
  );
}
