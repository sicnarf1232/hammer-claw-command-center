import Link from "next/link";
import { dbConfigured } from "@/lib/db";
import { listThreads, accountNames } from "@/lib/firehose/read";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Mailstream (Milestone 4): the full Merit OEM email firehose, thread-first.
// Every received and sent message lands here via the two Power Automate flows.
export default async function MailstreamPage() {
  if (!dbConfigured()) {
    return (
      <Page>
        <SetupNotice missing={["POSTGRES_URL"]} />
      </Page>
    );
  }

  const threads = await listThreads(80);
  const accounts = await accountNames(
    threads.map((t) => t.accountId).filter((x): x is number => x != null),
  );

  return (
    <Page subtitle={threads.length ? `${threads.length} recent threads` : undefined}>
      {threads.length === 0 ? (
        <div className="card max-w-2xl p-8 text-center">
          <div className="text-sm font-medium text-fg">No mail yet</div>
          <p className="mt-1 text-sm text-muted">
            Once the two Power Automate flows (capture received / capture sent)
            fire, every Merit OEM message lands here within a minute. Send or
            receive one email to confirm the firehose is live.
          </p>
        </div>
      ) : (
        <div className="grid max-w-3xl gap-2.5">
          {threads.map((t) => {
            const acct = t.accountId != null ? accounts.get(t.accountId) : undefined;
            return (
              <Link
                key={t.key}
                href={`/mailstream/${encodeURIComponent(t.key)}`}
                className="card lift block p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-fg">
                      {t.subject}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {t.parties.length ? t.parties.join(", ") : "Outbound"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-2xs tabular-nums text-muted">
                      {fmt(t.lastAt)}
                    </div>
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
                    <span className="chip border-warning/40 text-warning">
                      Needs review
                    </span>
                  ) : null}
                  {t.inbound > 0 ? (
                    <span className="chip border-border text-fg/60">
                      {t.inbound} in
                    </span>
                  ) : null}
                  {t.outbound > 0 ? (
                    <span className="chip border-border text-fg/60">
                      {t.outbound} out
                    </span>
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
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="display-title text-2xl text-fg">Mailstream</h1>
        <p className="mt-1 text-sm text-muted">
          Every Merit OEM email, inbound and outbound, threaded into the brain.
          {subtitle ? (
            <>
              {" "}
              <span className="font-mono tabular-nums text-fg/70">{subtitle}</span>
            </>
          ) : null}
        </p>
      </header>
      {children}
    </div>
  );
}
