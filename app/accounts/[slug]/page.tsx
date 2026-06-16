import Link from "next/link";
import { notFound } from "next/navigation";
import { vaultConfigured } from "@/lib/vault";
import { getAccountBySlug } from "@/lib/accounts";
import { buildAccountLookup, toTaskView } from "@/lib/taskView";
import { todayISO } from "@/lib/dates";
import TaskRow from "@/components/TaskRow";
import AccountNumberEditor from "@/components/AccountNumberEditor";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!vaultConfigured()) {
    return (
      <div>
        <BackLink />
        <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />
      </div>
    );
  }

  const account = await getAccountBySlug(slug);
  if (!account) notFound();

  const today = todayISO();
  const lookup = buildAccountLookup([account]);
  const openViews = account.openTasks.map((t) => toTaskView(t, lookup));

  return (
    <div>
      <BackLink />

      <header className="card mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              {account.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {account.type && <span>{account.type}</span>}
              {account.region && <span>· {account.region}</span>}
              {account.stage && <span>· {account.stage}</span>}
              {account.status && (
                <span className="chip border-border bg-surface2 text-muted">
                  {account.status}
                </span>
              )}
            </div>
          </div>
          <AccountNumberEditor
            path={account.path}
            initial={account.accountNumber}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {account.openTaskCount > 0 ? (
            <span className="chip border-primary/20 bg-primary/10 text-primary">
              {account.openTaskCount} open tasks
            </span>
          ) : (
            <span className="chip border-border bg-surface2 text-muted">
              no open tasks
            </span>
          )}
          {account.overdueCount > 0 && (
            <span className="chip border-danger/25 bg-danger/10 text-danger">
              {account.overdueCount} overdue
            </span>
          )}
        </div>

        {account.overview && (
          <p className="mt-4 text-sm leading-relaxed text-fg/75">
            {account.overview}
          </p>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Open tasks">
            {openViews.length === 0 ? (
              <p className="text-sm text-muted">Nothing open for this account.</p>
            ) : (
              <div className="space-y-2">
                {openViews.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={today}
                    showAccount={false}
                  />
                ))}
              </div>
            )}
          </Section>

          {account.situations.length > 0 && (
            <Section title="Active situations">
              <ul className="space-y-1.5">
                {account.situations.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-fg/80"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-5">
          {account.contacts.length > 0 && (
            <Section title="Contacts">
              <ul className="space-y-2.5">
                {account.contacts.map((c, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-medium text-fg">{c.name}</div>
                    {c.detail && (
                      <div className="text-xs text-muted">{c.detail}</div>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {c.email}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {account.links.length > 0 && (
            <Section title="Linked">
              <div className="flex flex-wrap gap-1.5">
                {account.links.map((l) => (
                  <span
                    key={l}
                    className="chip border-border bg-surface2 text-muted"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {account.recentDone.length > 0 && (
            <Section title="Recently completed">
              <ul className="space-y-1.5">
                {account.recentDone.map((t) => (
                  <li
                    key={`${t.sourceFile}:${t.sourceLine}`}
                    className="flex items-start gap-2 text-xs text-muted"
                  >
                    <span className="mt-0.5 font-mono tabular-nums text-muted/70">
                      {t.completed}
                    </span>
                    <span className="line-through">{t.title}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/accounts"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
    >
      ← Accounts
    </Link>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card mb-5 p-5">
      <h2 className="mb-3 text-sm font-semibold tracking-tight text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}
