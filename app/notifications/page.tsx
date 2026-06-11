import { dbConfigured } from "@/lib/db";
import { recentNotifications } from "@/lib/notify";
import { notifyConfigured } from "@/lib/notify";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
        <div className="card max-w-2xl p-5 text-sm text-slate-600">
          No notifications yet.
        </div>
      ) : (
        <div className="grid max-w-2xl gap-2">
          {rows.map((n) => (
            <div key={n.id} className="card p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">
                  {n.title}
                </div>
                <span className="chip border-slate-200 bg-slate-50 text-slate-500">
                  {n.kind}
                </span>
              </div>
              {n.body && <div className="mt-1 text-sm text-slate-600">{n.body}</div>}
              <div className="mt-1 text-xs text-slate-400">
                {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                {n.sentAt ? " · delivered" : external ? " · pending delivery" : " · in-app"}
              </div>
            </div>
          ))}
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
      <header className="mb-5">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Activity
        </h1>
        <p className="text-sm text-slate-500">
          Notification log: due-today, new flagged email, briefs. {subtitle}
        </p>
      </header>
      {children}
    </div>
  );
}
