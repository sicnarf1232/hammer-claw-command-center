import Link from "next/link";
import { dbConfigured } from "@/lib/db";
import { recentNotifications, notifyConfigured } from "@/lib/notify";
import { notificationHref } from "@/lib/notifyLink";
import { todayISO } from "@/lib/dates";
import { groupByDay, countByKind } from "@/lib/activityGroup";
import SetupNotice from "@/components/SetupNotice";
import {
  ActivityIcon,
  AlertIcon,
  ClockIcon,
  InboxIcon,
  SparkIcon,
  type IconProps,
} from "@/components/icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NotificationRow = Awaited<ReturnType<typeof recentNotifications>>[number];

// Per-kind icon + color treatment (dev-feedback #20 Part A), reusing the same
// semantic status tokens as the rest of the app (chips.tsx, StatTile, etc.)
// rather than inventing new ad hoc colors.
const KIND_META: Record<string, { label: string; classes: string; Icon: (p: IconProps) => React.ReactElement }> = {
  due_today: { label: "Due today", classes: "border-warning/25 bg-warning/10 text-warning", Icon: ClockIcon },
  new_email: { label: "Email", classes: "border-info/25 bg-info/10 text-info", Icon: InboxIcon },
  brief: { label: "Brief", classes: "border-accent/25 bg-accent/10 text-accent", Icon: SparkIcon },
  error: { label: "Error", classes: "border-danger/25 bg-danger/10 text-danger", Icon: AlertIcon },
};
const DEFAULT_KIND_META = { label: "Update", classes: "border-border bg-surface2 text-muted", Icon: ActivityIcon };

function kindMeta(kind: string) {
  return KIND_META[kind] ?? DEFAULT_KIND_META;
}

// Time-of-day only; the day header already carries the date, so a row does
// not need to repeat a full locale date-time dump (the previous "looks like a
// debug log" smell).
function timeLabel(createdAt: unknown): string {
  if (!createdAt) return "";
  const d = new Date(createdAt as string | number | Date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default async function NotificationsPage() {
  if (!dbConfigured()) {
    return (
      <Shell>
        <SetupNotice missing={["POSTGRES_URL"]} />
      </Shell>
    );
  }

  const rows = await recentNotifications(60);
  const external = notifyConfigured();
  const today = todayISO();
  const groups = groupByDay(rows, (n) => n.createdAt, today);
  const todaysRows = groups.find((g) => g.dayKey === today)?.rows ?? [];
  const todayCounts = countByKind(todaysRows, (n) => n.kind);

  return (
    <Shell external={external}>
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <SummaryStrip counts={todayCounts} total={todaysRows.length} />
          <div className="mt-6 space-y-8">
            {groups.map((g) => (
              <section key={g.dayKey}>
                <h2 className="mb-3 flex items-center gap-2.5 px-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-fg">{g.label}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span className="text-2xs font-medium text-muted">
                    {g.rows.length} {g.rows.length === 1 ? "item" : "items"}
                  </span>
                </h2>
                <div className="grid gap-2">
                  {g.rows.map((n) => (
                    <NotificationCard key={n.id} n={n} external={external} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}

function SummaryStrip({ counts, total }: { counts: Record<string, number>; total: number }) {
  if (total === 0) {
    return (
      <div className="card flex items-center gap-2.5 px-4 py-3.5 text-sm text-muted">
        <ActivityIcon className="h-4 w-4 shrink-0 text-muted" />
        Nothing has happened yet today. Due-today, flagged email, and briefs will show up here.
      </div>
    );
  }
  const parts = [
    counts.due_today ? `${counts.due_today} due today` : null,
    counts.new_email ? `${counts.new_email} new email${counts.new_email === 1 ? "" : "s"}` : null,
    counts.brief ? `${counts.brief} brief${counts.brief === 1 ? "" : "s"}` : null,
    counts.error ? `${counts.error} error${counts.error === 1 ? "" : "s"}` : null,
  ].filter((p): p is string => Boolean(p));

  return (
    <div className="card flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3.5 text-sm">
      <span className="font-semibold text-fg">Today:</span>
      <span className="text-muted">
        {parts.length ? parts.join(", ") : `${total} update${total === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
      <ActivityIcon className="h-6 w-6 text-muted" />
      <div className="text-sm font-medium text-fg">No activity yet</div>
      <p className="text-sm text-muted">
        Due-today, new flagged email, and briefs will show up here.
      </p>
    </div>
  );
}

function NotificationCard({ n, external }: { n: NotificationRow; external: boolean }) {
  const meta = kindMeta(n.kind);
  const Icon = meta.Icon;
  const target = notificationHref(n.kind, n.meta);
  const href = target && target !== "/notifications" ? target : null;
  const deliveryLabel = n.sentAt ? "Delivered" : external ? "Pending delivery" : "In app";

  const inner = (
    <div className="flex items-start gap-3 p-4">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${meta.classes}`}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="text-sm font-semibold text-fg">{n.title}</div>
          <span className={`chip shrink-0 ${meta.classes}`}>{meta.label}</span>
        </div>
        {n.body ? <p className="mt-1 line-clamp-2 text-sm text-muted">{n.body}</p> : null}
        <div className="mt-2 flex items-center gap-2 text-2xs text-muted/80">
          <span className="font-mono tabular-nums">{timeLabel(n.createdAt)}</span>
          <span aria-hidden="true">&#183;</span>
          <span>{deliveryLabel}</span>
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="card block transition-colors hover:bg-surface2">
      {inner}
    </Link>
  ) : (
    <div className="card">{inner}</div>
  );
}

function Shell({
  children,
  external,
}: {
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <span className="eyebrow text-accent">Activity</span>
        <h1 className="display-title mt-1 text-2xl text-fg">What happened, and what needs you</h1>
        <p className="mt-1 text-sm text-muted">
          Due-today, new flagged email, and briefs, grouped by day.{" "}
          {external
            ? "External delivery is on (NOTIFY_WEBHOOK_URL set)."
            : "In-app only. Set NOTIFY_WEBHOOK_URL to also push to your phone or email."}
        </p>
      </header>
      {children}
    </div>
  );
}
