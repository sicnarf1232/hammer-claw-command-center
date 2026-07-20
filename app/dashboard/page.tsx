import Link from "next/link";
import { getDashboardData } from "@/lib/dashboard";
import { notificationHref } from "@/lib/notifyLink";
import { customerHue, initials } from "@/lib/customerHues";
import { formatDateShort } from "@/lib/dates";
import TaskRow from "@/components/TaskRow";
import AskBar from "@/components/AskBar";
import { InboxIcon, MeetingsIcon, ActivityIcon, AlertIcon, ClockIcon } from "@/components/icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DENVER = "America/Denver";

const PATHWAY_LABEL: Record<string, string> = {
  "needs-reply": "Needs reply",
  "quote-request": "Quote",
  "quality-pcn": "Quality / PCN",
  logistics: "Logistics",
  fyi: "FYI",
  noise: "Noise",
};

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: DENVER, hour: "numeric", hour12: false }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function longDate(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DENVER,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function meetingDay(iso: string | null): string {
  if (!iso) return "";
  return formatDateShort(iso);
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div>
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="display-title text-[28px] text-fg">{greeting()}, Jordan.</h1>
          <p className="mt-0.5 text-sm text-muted">{longDate()}</p>
        </div>
        <AskBar />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_300px]">
        {/* Column 1 — Today's commits */}
        <section className="min-w-0">
          <SectionHeader title="Today's commits" href="/today" cta="Plan day" />
          {data.commits.length === 0 ? (
            <EmptyCard>Nothing committed for today. Pull from your queue in Today.</EmptyCard>
          ) : (
            <div className="space-y-2">
              {data.commits.slice(0, 8).map((t) => (
                <div key={t.id} className="card px-1">
                  <TaskRow task={t} today={data.today} />
                </div>
              ))}
            </div>
          )}

          {data.overdue.length > 0 ? (
            <details className="mt-4 group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-1 text-sm font-semibold text-due">
                <AlertIcon className="h-4 w-4" />
                {data.overdue.length} overdue {data.overdue.length === 1 ? "task" : "tasks"}
                <span className="text-2xs font-normal text-muted group-open:hidden">show</span>
              </summary>
              <div className="mt-2 space-y-2">
                {data.overdue.slice(0, 12).map((t) => (
                  <div key={t.id} className="card px-1">
                    <TaskRow task={t} today={data.today} />
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        {/* Column 2 — Inbox + Accounts */}
        <section className="min-w-0 space-y-5">
          <div>
            <SectionHeader title="Inbox" href="/inbox" cta="Open" icon={<InboxIcon className="h-4 w-4" />} />
            <div className="mb-3 grid grid-cols-3 gap-2">
              <StatTile label="Needs attention" value={data.inbox.needsAttention} tone="accent" href="/inbox?folder=attention" />
              <StatTile label="Flagged" value={data.inbox.flagged} tone="due" href="/inbox?folder=flagged" />
              <StatTile label="Needs reply" value={data.inbox.needsReply} tone="warm" href="/inbox?folder=needs-reply" />
            </div>
            {data.inbox.threads.length === 0 ? (
              <EmptyCard>Inbox is clear. Nothing needs your attention.</EmptyCard>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {data.inbox.threads.map((t, i) => (
                  <Link
                    key={t.key}
                    href={`/inbox/${encodeURIComponent(t.key)}`}
                    className={`block px-3 py-2.5 transition-colors hover:bg-surface2 ${i === 0 ? "" : "border-t border-border"}`}
                  >
                    {/* The matter leads; the "because" is the second line. */}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-fg">{t.subject}</span>
                      {t.pathway ? (
                        <span className="shrink-0 text-2xs font-semibold text-accent">{PATHWAY_LABEL[t.pathway] ?? t.pathway}</span>
                      ) : null}
                    </div>
                    {t.linkedTask ? (
                      <div className={`truncate text-2xs font-semibold ${t.linkedTask.overdue ? "text-due" : "text-fg/70"}`}>
                        {t.linkedTask.overdue ? "Task overdue" : "Linked task"}
                        {t.linkedTask.due ? ` (${t.linkedTask.due})` : ""}: {t.linkedTask.title}
                      </div>
                    ) : null}
                    <div className="truncate text-xs text-muted">
                      <span className="text-fg/60">{t.who}</span>
                      {t.accountName ? <span className="text-fg/50"> · {t.accountName}</span> : null}
                      {t.summary ? <> — {t.summary}</> : null}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionHeader title="Accounts needing attention" href="/accounts" cta="All" />
            {data.accounts.length === 0 ? (
              <EmptyCard>No accounts have overdue work. Nice.</EmptyCard>
            ) : (
              <div className="space-y-1.5">
                {data.accounts.map((a) => {
                  const hue = customerHue(a.name);
                  return (
                    <Link
                      key={a.slug}
                      href={`/accounts/${a.slug}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 transition-colors hover:bg-surface2"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white"
                        style={{ background: hue.hue }}
                      >
                        {initials(a.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{a.name}</span>
                      <span className="chip border-due/40 text-due">{a.overdueCount} overdue</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right rail */}
        <aside className="space-y-5">
          <div>
            <RailHeader title="Upcoming meetings" icon={<MeetingsIcon className="h-3.5 w-3.5" />} />
            {data.meetings.length === 0 ? (
              <p className="px-1 text-xs text-muted">No upcoming meetings synced yet.</p>
            ) : (
              <div className="space-y-1.5">
                {data.meetings.map((m) => (
                  <div key={m.id} className="rounded-xl border border-border bg-surface px-3 py-2">
                    <div className="truncate text-sm font-semibold text-fg">{m.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-2xs text-muted">
                      <span>{meetingDay(m.date)}</span>
                      {m.accountName ? <span className="truncate text-accent">{m.accountName}</span> : null}
                      {m.isInternal ? <span>Internal</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <RailHeader title="Recent activity" icon={<ActivityIcon className="h-3.5 w-3.5" />} href="/notifications" />
            {data.activity.length === 0 ? (
              <p className="px-1 text-xs text-muted">Nothing recent.</p>
            ) : (
              <div className="space-y-1">
                {/* Each entry clicks through to where the item really lives:
                    email to its thread, due-today to Tasks, briefs to the
                    card below, everything else to the activity log. */}
                {data.activity.map((n) => (
                  <Link
                    key={n.id}
                    href={notificationHref(n.kind, n.meta) ?? "/notifications"}
                    className="flex items-start gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-surface2"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-fg">{n.title}</div>
                      {n.body ? <div className="truncate text-2xs text-muted">{n.body}</div> : null}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div id="brief">
            <RailHeader title="Latest brief" icon={<ClockIcon className="h-3.5 w-3.5" />} />
            {data.brief ? (
              <details className="rounded-xl border border-border bg-surface px-3 py-2">
                <summary className="cursor-pointer list-none text-sm font-semibold text-fg">
                  {data.brief.title}
                  <span className="ml-1.5 text-2xs font-normal text-muted">expand</span>
                </summary>
                <div className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap border-t border-border pt-2 text-xs leading-relaxed text-fg/80">
                  {data.brief.body || "This brief has no body."}
                </div>
              </details>
            ) : (
              <p className="px-1 text-xs text-muted">
                No brief yet. The morning cron writes one here each day.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SectionHeader({ title, href, cta, icon }: { title: string; href: string; cta: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-fg">
        {icon ? <span className="text-accent">{icon}</span> : null}
        {title}
      </h2>
      <Link href={href} className="text-2xs font-semibold text-accent hover:underline">
        {cta} →
      </Link>
    </div>
  );
}

function RailHeader({ title, icon, href }: { title: string; icon: React.ReactNode; href?: string }) {
  const inner = (
    <>
      <span className="text-accent">{icon}</span>
      {title}
    </>
  );
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      {href ? (
        <Link href={href} className="eyebrow flex items-center gap-1.5 text-[10px] text-muted hover:text-fg">
          {inner}
        </Link>
      ) : (
        <div className="eyebrow flex items-center gap-1.5 text-[10px] text-muted">{inner}</div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone, href }: { label: string; value: number; tone: "accent" | "due" | "warm"; href: string }) {
  const color = tone === "due" ? "var(--due)" : tone === "warm" ? "var(--warm)" : "var(--accent)";
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface2"
    >
      <div className="text-xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-medium leading-tight text-muted">{label}</div>
    </Link>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">{children}</div>;
}
