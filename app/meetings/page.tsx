import Link from "next/link";
import {
  vaultConfigured,
  getMeetingsIndex,
  getMeetingNoteByPath,
  getRoster,
  getSeriesList,
  getSeriesByPath,
} from "@/lib/vault";
import type { Roster, ActionItem } from "@/lib/vault/types";
import { Attendee } from "@/components/Attendee";
import { PriorityChip } from "@/components/chips";
import SetupNotice from "@/components/SetupNotice";
import PullFromGranola from "@/components/PullFromGranola";
import MeetingsHub from "@/components/MeetingsHub";
import { granolaConfigured } from "@/lib/granola";
import { customerHue, initials } from "@/lib/customerHues";
import { meetingNoteToEditable } from "@/lib/meetingEdit";
import { listAccounts } from "@/lib/accounts";
import MeetingEditor from "@/components/MeetingEditor";

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

  let rows: Awaited<ReturnType<typeof getMeetingsIndex>> = [];
  let error: string | null = null;
  try {
    rows = await getMeetingsIndex();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the meetings index.";
  }
  const seriesList = await getSeriesList().catch(() => []);

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
            Nothing found in{" "}
            <code className="font-mono">100 Periodics/Meetings-Index.md</code>.
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
        />
      )}
    </div>
  );
}

/* ============================ Screen 3 — Meeting detail ===================== */

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

  const { hue } = customerHue(note.customer?.display ?? "Internal");
  const sections = orderedSections(note.sections);

  return (
    <Shell>
      <article className="panel texture mx-auto max-w-3xl overflow-hidden p-6 sm:p-9">
        <div className="flex items-center justify-between gap-3">
          <BackLink />
          <Link
            href={`/meetings?note=${encodeURIComponent(path)}&edit=1`}
            className="btn btn-ghost px-3 py-1 text-xs"
          >
            Edit
          </Link>
        </div>
        <h1 className="mt-4 text-[30px] font-bold leading-tight tracking-tight text-fg">
          {note.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink2">
          <span className="tabular-nums">{note.date}</span>
          {note.customer && (
            <span className="eyebrow text-[11px]" style={{ color: hue }}>
              {note.customer.display}
            </span>
          )}
          {note.series && <SeriesPill name={note.series} />}
        </div>
        {note.topic && (
          <p className="mt-2 text-sm text-ink2">
            <span className="font-semibold text-fg">Topic:</span> {note.topic}
          </p>
        )}

        {note.attendees.length > 0 && (
          <div className="mt-5">
            <p className="eyebrow mb-2 text-muted">Attendees</p>
            <div className="flex flex-wrap gap-1.5">
              {note.attendees.map((a) => (
                <Attendee key={a} name={a} roster={roster} />
              ))}
            </div>
          </div>
        )}

        {note.sections["TL;DR"] && (
          <div className="mt-6">
            <p className="eyebrow mb-2 text-muted">TL;DR</p>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg/90">
              {note.sections["TL;DR"]}
            </p>
          </div>
        )}

        <div className="mt-7">
          <p className="eyebrow mb-2.5 text-muted">Action Items</p>
          {note.actionItems.length === 0 ? (
            <p className="text-sm text-muted">None captured.</p>
          ) : (
            <div className="grid gap-2">
              {note.actionItems.map((ai, i) => (
                <ActionItemRow key={i} item={ai} />
              ))}
            </div>
          )}
        </div>

        {sections.map((s, i) =>
          s.kind === "full" ? (
            <FullNotesSection key={s.heading} index={i + 1} body={s.body} />
          ) : (
            <NumberedSection
              key={s.heading}
              index={i + 1}
              title={s.heading}
              body={s.body}
              variant={s.variant}
            />
          ),
        )}

        <Footer seriesName={note.series} />
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
  let error: string | null = null;
  try {
    series = await getSeriesByPath(path);
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

  return (
    <Shell>
      <article className="panel texture mx-auto max-w-3xl overflow-hidden p-6 sm:p-9">
        <BackLink />
        <div className="mt-4 flex items-center gap-2.5">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: series.color || "var(--accent)" }}
          />
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-fg">
            {series.name}
          </h1>
        </div>
        <p className="eyebrow mt-2 text-muted">
          Rolling notes · {series.log.length} session
          {series.log.length === 1 ? "" : "s"}
          {series.updated ? ` · latest ${series.updated}` : ""}
        </p>

        {series.participants.length > 0 && (
          <div className="mt-5">
            <p className="eyebrow mb-2 text-muted">People involved</p>
            <div className="flex flex-wrap gap-1.5">
              {series.participants.map((p) => (
                <PersonChip key={p} name={p} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi value={series.log.length} label="Sessions" />
          <Kpi value={series.participants.length} label="People" />
          <Kpi value={series.cadence ?? "—"} label="Cadence" />
          <Kpi value={series.updated ?? "—"} label="Latest" />
        </div>

        <div
          className="mt-6 rounded-[14px] p-5"
          style={{ background: "var(--warm-soft)", borderLeft: "4px solid var(--warm)" }}
        >
          <p className="eyebrow mb-2" style={{ color: "var(--warm)" }}>
            Rolling TL;DR
          </p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg/90">
            {series.currentState || "(none yet)"}
          </div>
        </div>

        <div>
          <SectionHeader title="Sessions" />
          {series.log.length === 0 ? (
            <p className="text-sm text-muted">No entries yet.</p>
          ) : (
            <div className="grid gap-2">
              {series.log.map((e, i) => (
                <div
                  key={i}
                  className="card lift p-4"
                  style={{ borderLeft: "3px solid var(--accent)" }}
                >
                  <div className="text-sm font-bold text-fg">{e.heading}</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-fg/70">
                    {e.text.trim()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Footer seriesName={null} />
      </article>
    </Shell>
  );
}

/* ================================ shared bits ============================== */

interface OrderedSection {
  heading: string;
  body: string;
  variant: "decision" | "number" | "watch" | "full";
  kind: "list" | "full";
}

function orderedSections(sections: Record<string, string>): OrderedSection[] {
  const out: OrderedSection[] = [];
  const add = (heading: string, variant: OrderedSection["variant"]) => {
    if (sections[heading]) out.push({ heading, body: sections[heading], variant, kind: "list" });
  };
  add("Key Decisions", "decision");
  add("Numbers That Matter", "number");
  add("Watch-Outs", "watch");
  if (sections["Full Notes"]) {
    out.push({ heading: "Full Notes", body: sections["Full Notes"], variant: "full", kind: "full" });
  }
  return out;
}

function bulletsOf(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

// Section header in the design's style: a warm two-digit index + uppercase
// kicker. Pass label only (no number) to render just the kicker.
function SectionHeader({ n, title }: { n?: number; title: string }) {
  return (
    <div className="mb-3.5 mt-9 flex items-baseline gap-3.5">
      {n != null && (
        <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--warm)" }}>
          {String(n).padStart(2, "0")}
        </span>
      )}
      <span className="text-sm font-bold uppercase tracking-[0.1em] text-fg">
        {title}
      </span>
    </div>
  );
}

function NumberedSection({
  index,
  title,
  body,
  variant,
}: {
  index: number;
  title: string;
  body: string;
  variant: OrderedSection["variant"];
}) {
  const items = bulletsOf(body);
  return (
    <section>
      <SectionHeader n={index} title={title} />
      <div className="flex flex-col">
        {items.map((it, i) => (
          <ListItem key={i} text={it} variant={variant} />
        ))}
      </div>
    </section>
  );
}

function ListItem({ text, variant }: { text: string; variant: OrderedSection["variant"] }) {
  if (variant === "watch") {
    return (
      <div className="-mx-3 flex items-center gap-4 rounded-[10px] px-3 py-3 transition-colors hover:bg-[color:var(--due-soft)]">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: "var(--due)" }}
        >
          !
        </span>
        <span className="text-[15px] text-fg">{text}</span>
      </div>
    );
  }
  if (variant === "number") {
    return (
      <div
        className="-mx-3 mb-1.5 flex items-center gap-4 rounded-[12px] border px-4 py-3"
        style={{ background: "var(--accent-soft)", borderColor: "var(--line)" }}
      >
        <span className="shrink-0 text-sm" style={{ color: "var(--accent)" }}>◆</span>
        <span className="text-[15px] text-fg">{text}</span>
      </div>
    );
  }
  return (
    <div className="-mx-3 flex items-center gap-4 rounded-[10px] px-3 py-3 transition-colors hover:bg-surface2">
      <span
        className="block shrink-0 rotate-45 rounded-[2px]"
        style={{ width: 11, height: 11, background: "var(--accent)" }}
      />
      <span className="text-[15px] text-fg">{text}</span>
    </div>
  );
}

// Full Notes renders its "### Subsection" headings as styled subheads.
function FullNotesSection({ index, body }: { index: number; body: string }) {
  const blocks: { heading: string | null; text: string }[] = [];
  let current: { heading: string | null; text: string } | null = null;
  for (const line of body.split("\n")) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) {
      current = { heading: h[1].trim(), text: "" };
      blocks.push(current);
    } else {
      if (!current) {
        current = { heading: null, text: "" };
        blocks.push(current);
      }
      current.text += (current.text ? "\n" : "") + line;
    }
  }

  return (
    <section>
      <SectionHeader n={index} title="Full Notes" />
      <div className="grid gap-3">
        {blocks.map((b, i) => (
          <div key={i}>
            {b.heading && (
              <div className="mb-0.5 text-sm font-semibold text-fg">{b.heading}</div>
            )}
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg/75">
              {b.text.trim()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionItemRow({ item }: { item: ActionItem }) {
  const customer =
    item.task?.customer && item.task.customer !== "internal"
      ? item.task.customer.display
      : null;
  return (
    <div
      className="lift rounded-[12px] p-3"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderLeft: "3px solid var(--accent)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 text-sm"
          style={{ color: item.done ? "var(--ok)" : "var(--ink-3)" }}
        >
          {item.done ? "☑" : "☐"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-fg/90">
            {item.owner && (
              <span className="font-semibold" style={{ color: "var(--accent-2)" }}>
                {item.owner}:{" "}
              </span>
            )}
            {item.text}
            {item.isJordans && (
              <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
                <PriorityChip priority={item.task?.priority} />
                {customer && (
                  <span className="chip" style={{ borderColor: "var(--line-2)" }}>
                    {customer}
                  </span>
                )}
                {item.task?.due && item.task.due !== "TBD" && (
                  <span
                    className="chip tabular-nums"
                    style={{ background: "var(--due-soft)", color: "var(--due-ink)", borderColor: "transparent" }}
                  >
                    due {item.task.due}
                  </span>
                )}
                {item.task?.due === "TBD" && (
                  <span
                    className="chip"
                    style={{ background: "var(--warm-soft)", color: "var(--warm)", borderColor: "transparent" }}
                  >
                    ⚑ needs due date
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-2xs text-muted">
            {item.isJordans ? "Jordan" : "tracking only"}
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonChip({ name }: { name: string }) {
  return (
    <span className="chip" style={{ borderColor: "var(--line-2)" }}>
      <span
        className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold"
        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
      >
        {initials(name)}
      </span>
      <span className="font-normal text-fg">{name}</span>
    </span>
  );
}

function Kpi({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="card lift p-4 text-center">
      <div className="truncate text-2xl font-bold" style={{ color: "var(--accent-2)" }}>
        {value}
      </div>
      <div className="eyebrow mt-1 text-muted">{label}</div>
    </div>
  );
}

function SeriesPill({ name }: { name: string }) {
  return (
    <span
      className="chip"
      style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}
    >
      {name}
    </span>
  );
}

function Footer({ seriesName }: { seriesName: string | null | undefined }) {
  return (
    <footer className="mt-9 border-t-2 pt-4" style={{ borderColor: "var(--accent)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          <span className="font-semibold text-fg">Film Room</span> · Confidential
        </span>
        <div className="flex items-center gap-2">
          {seriesName && <SeriesPill name={seriesName} />}
          <span>Source · Hammer Claw Vault</span>
        </div>
      </div>
    </footer>
  );
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
