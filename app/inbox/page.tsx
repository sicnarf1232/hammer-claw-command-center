import Link from "next/link";
import { dbConfigured } from "@/lib/db";
import {
  listThreads,
  threadCounts,
  accountNames,
  type InboxView,
} from "@/lib/firehose/read";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABS: { key: InboxView; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "flagged", label: "Flagged" },
  { key: "all", label: "All mail" },
];

// Unified inbox (Milestone 4): one thread-first view over the whole Merit OEM
// firehose. Flagged = you flagged it in Outlook; needs-review = unmapped sender.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (!dbConfigured()) {
    return (
      <Page view="attention" counts={{ attention: 0, flagged: 0, all: 0 }}>
        <SetupNotice missing={["POSTGRES_URL"]} />
      </Page>
    );
  }

  const sp = await searchParams;
  const view: InboxView =
    sp.view === "flagged" || sp.view === "all" ? sp.view : "attention";

  const [threads, counts] = await Promise.all([
    listThreads({ view, limit: 100 }),
    threadCounts(),
  ]);
  const accounts = await accountNames(
    threads.map((t) => t.accountId).filter((x): x is number => x != null),
  );

  return (
    <Page view={view} counts={counts}>
      {threads.length === 0 ? (
        <EmptyState view={view} />
      ) : (
        <div className="grid max-w-3xl gap-2.5">
          {threads.map((t) => {
            const acct = t.accountId != null ? accounts.get(t.accountId) : undefined;
            return (
              <Link
                key={t.key}
                href={`/inbox/${encodeURIComponent(t.key)}`}
                className="card lift block p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {t.flagged ? <span title="Flagged in Outlook">🚩</span> : null}
                      <span className="truncate text-sm font-semibold text-fg">
                        {t.subject}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {t.parties.length ? t.parties.join(", ") : "Outbound"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-2xs tabular-nums text-muted">{fmt(t.lastAt)}</div>
                    {t.count > 1 ? (
                      <div className="mt-1 text-2xs tabular-nums text-fg/60">
                        {t.count} messages
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {acct ? (
                    <span className="chip border-border text-fg/75">{acct.name}</span>
                  ) : t.needsReview ? (
                    <span className="chip border-warning/40 text-warning">Needs review</span>
                  ) : null}
                  {t.replied ? (
                    <span className="chip border-ok/40 text-ok">Replied</span>
                  ) : null}
                  {t.inbound > 0 ? (
                    <span className="chip border-border text-fg/60">{t.inbound} in</span>
                  ) : null}
                  {t.outbound > 0 ? (
                    <span className="chip border-border text-fg/60">{t.outbound} out</span>
                  ) : null}
                  {t.hasAttachments ? (
                    <span className="chip border-border text-fg/60">Attachments</span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Page>
  );
}

function EmptyState({ view }: { view: InboxView }) {
  return (
    <div className="card max-w-2xl p-8 text-center">
      <div className="text-sm font-medium text-fg">
        {view === "all" ? "No mail yet" : "Nothing needs attention"}
      </div>
      <p className="mt-1 text-sm text-muted">
        {view === "all" ? (
          <>
            Once the two Power Automate flows (capture received / capture sent)
            fire, every Merit OEM message lands here within a minute. Flag one in
            Outlook to pin it to the top.
          </>
        ) : (
          <>
            Flagged emails and unmapped senders show up here. Switch to{" "}
            <span className="font-mono text-fg/75">All mail</span> to see the full
            firehose.
          </>
        )}
      </p>
    </div>
  );
}

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Page({
  children,
  view,
  counts,
}: {
  children: React.ReactNode;
  view: InboxView;
  counts: { attention: number; flagged: number; all: number };
}) {
  return (
    <div>
      <header className="mb-5">
        <h1 className="display-title text-2xl text-fg">Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          Every Merit OEM email, inbound and outbound, threaded. Open a thread to
          read the full chain and reply.
        </p>
      </header>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const active = tab.key === view;
          const n = counts[tab.key];
          return (
            <Link
              key={tab.key}
              href={tab.key === "attention" ? "/inbox" : `/inbox?view=${tab.key}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-transparent bg-primary text-primary-fg"
                  : "border-border bg-surface text-fg/70 hover:text-fg"
              }`}
            >
              {tab.label}
              <span
                className={`tabular-nums ${active ? "text-primary-fg/80" : "text-muted"}`}
              >
                {n}
              </span>
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
