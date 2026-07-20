import Link from "next/link";
import { dbConfigured } from "@/lib/db";
import { recentNotifications } from "@/lib/notify";
import { notifyConfigured } from "@/lib/notify";
import { notificationHref } from "@/lib/notifyLink";
import { formatDateMDY } from "@/lib/dates";
import SetupNotice from "@/components/SetupNotice";
import { ActivityIcon } from "@/components/icons";

// The notification's created-at date, reformatted to the house MM/DD/YYYY
// display while leaving the time-of-day portion untouched.
function createdAtLabel(createdAt: unknown): string {
  if (!createdAt) return "";
  const d = new Date(createdAt as string | number | Date);
  if (Number.isNaN(d.getTime())) return "";
  const dateStr = formatDateMDY(d.toLocaleDateString("en-CA"));
  const timeStr = d.toLocaleTimeString();
  return dateStr ? `${dateStr}, ${timeStr}` : timeStr;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Map a notification kind to a status color token.
function kindStatus(kind: string): "danger" | "warning" | "info" | "success" {
  switch (kind) {
    case "error":
      return "danger";
    case "due_today":
      return "warning";
    case "success":
      return "success";
    case "new_email":
    case "brief":
    default:
      return "info";
  }
}

const dotClass: Record<"danger" | "warning" | "info" | "success", string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
};

export default async function NotificationsPage() {
  if (!dbConfigured()) {
    return (
      <Shell>
        <SetupNotice missing={["POSTGRES_URL"]} />
      </Shell>
    );
  }

  const rows = await recentNotifications(40);
  const external = notifyConfigured();

  return (
    <Shell
      subtitle={
        external
          ? "External delivery is on (NOTIFY_WEBHOOK_URL set)."
          : "In-app only. Set NOTIFY_WEBHOOK_URL to also push to your phone or email."
      }
    >
      {rows.length === 0 ? (
        <div className="card flex max-w-2xl flex-col items-center gap-2 p-10 text-center">
          <ActivityIcon className="h-6 w-6 text-muted" />
          <div className="text-sm font-medium text-fg">No activity yet</div>
          <p className="text-sm text-muted">
            Due-today, new flagged email, and briefs will show up here.
          </p>
        </div>
      ) : (
        <div className="grid max-w-2xl gap-2">
          {rows.map((n) => {
            const status = kindStatus(n.kind);
            // Click through to where the item lives (thread, tasks, brief
            // card); entries that live right here stay plain.
            const target = notificationHref(n.kind, n.meta);
            const href = target && target !== "/notifications" ? target : null;
            const inner = (
              <div className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass[status]}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-fg">
                        {n.title}
                      </div>
                      <span className="chip shrink-0 border-border bg-surface2 text-muted">
                        {n.kind}
                      </span>
                    </div>
                    {n.body && (
                      <div className="mt-1 text-sm text-muted">{n.body}</div>
                    )}
                    <div className="mt-1 font-mono text-xs tabular-nums text-muted">
                      {createdAtLabel(n.createdAt)}
                      {n.sentAt
                        ? " · delivered"
                        : external
                          ? " · pending delivery"
                          : " · in-app"}
                    </div>
                  </div>
                </div>
            );
            return href ? (
              <Link key={n.id} href={href} className="card block p-3 transition-colors hover:bg-surface2">
                {inner}
              </Link>
            ) : (
              <div key={n.id} className="card p-3">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
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
        <h1 className="display-title text-2xl text-fg">Activity</h1>
        <p className="mt-1 text-sm text-muted">
          Notification log: due-today, new flagged email, briefs. {subtitle}
        </p>
      </header>
      {children}
    </div>
  );
}
