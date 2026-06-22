import Link from "next/link";
import {
  vaultConfigured,
  getPersonProfile,
  getRoster,
  classifyName,
} from "@/lib/vault";
import { personNameMatches } from "@/lib/vault/people";
import { listAccounts } from "@/lib/accounts";
import { buildAccountLookup, toTaskView } from "@/lib/taskView";
import { todayISO } from "@/lib/dates";
import { initials } from "@/lib/customerHues";
import TaskRow from "@/components/TaskRow";
import PersonClassifier from "@/components/PersonClassifier";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PersonPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: raw } = await params;
  const name = decodeURIComponent(raw);

  if (!vaultConfigured()) {
    return <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />;
  }

  const [profile, accounts, roster] = await Promise.all([
    getPersonProfile(name).catch(() => null),
    listAccounts().catch(() => []),
    getRoster().catch(() => new Map()),
  ]);

  if (!profile) {
    return (
      <div className="card max-w-2xl border-danger/30 p-5 text-sm text-danger">
        Could not load a profile for {name}.
      </div>
    );
  }

  const lookup = buildAccountLookup(accounts);
  const today = todayISO();
  const companyAcct = profile.company
    ? lookup.get(profile.company.trim().toLowerCase())
    : undefined;
  const open = profile.items.filter((i) => !i.done);
  const entry = classifyName(roster, name);
  const currentClass = personNameMatches(name, "Jordan Francis")
    ? "merit"
    : (entry?.classification ?? null);

  return (
    <article className="panel texture mx-auto max-w-5xl overflow-hidden p-6 sm:p-9">
      <Link
        href="/meetings"
        className="eyebrow inline-flex items-center gap-1 text-muted transition-colors hover:text-[color:var(--accent)]"
      >
        ← Meetings
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-[14px] text-base font-bold"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {initials(name)}
        </span>
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-fg">
            {name}
          </h1>
          {profile.company && (
            <p className="mt-0.5 text-sm text-muted">
              {companyAcct ? (
                <Link href={`/accounts/${companyAcct.slug}`} className="hover:underline">
                  {profile.company}
                </Link>
              ) : (
                profile.company
              )}
            </p>
          )}
          <div className="mt-2">
            <PersonClassifier
              name={name}
              classification={currentClass}
              account={entry?.account}
              accounts={accounts.map((a) => a.name)}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Kpi value={open.length} label="Open items" />
        <Kpi value={profile.items.length} label="Total items" />
        <Kpi value={profile.meetings.length} label="Meetings" />
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-3">
        <div className="space-y-7 lg:col-span-2">
          <section>
            <p className="eyebrow mb-2.5 text-muted">Their items</p>
            {profile.items.length === 0 ? (
              <p className="text-sm text-muted">No action items found for {name}.</p>
            ) : (
              <div className="grid gap-2">
                {profile.items.map((it, i) =>
                  it.task ? (
                    <TaskRow
                      key={`${it.sourceFile}:${it.sourceLine}`}
                      task={toTaskView(it.task, lookup)}
                      today={today}
                    />
                  ) : (
                    <ItemRow key={i} item={it} />
                  ),
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-4">
            <p className="eyebrow mb-2.5 text-muted">Meetings</p>
            {profile.meetings.length === 0 ? (
              <p className="text-sm text-muted">None found.</p>
            ) : (
              <div className="grid gap-1.5">
                {profile.meetings.slice(0, 25).map((m, i) => (
                  <Link
                    key={`${m.path}-${i}`}
                    href={`/meetings?note=${encodeURIComponent(m.path)}`}
                    className="block rounded-[8px] p-1.5 text-xs hover:bg-surface2"
                  >
                    <span className="font-medium text-fg">{m.title}</span>
                    <span className="ml-1 text-muted">
                      {m.date ? `· ${m.date}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </article>
  );
}

function ItemRow({
  item,
}: {
  item: { text: string; done: boolean; due?: string; meetingTitle: string; sourceFile: string };
}) {
  return (
    <Link
      href={`/meetings?note=${encodeURIComponent(item.sourceFile)}`}
      className="card lift block p-3"
      style={{ borderLeft: "3px solid var(--line-2)" }}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-sm" style={{ color: item.done ? "var(--ok)" : "var(--ink-3)" }}>
          {item.done ? "☑" : "☐"}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`text-sm ${item.done ? "text-muted line-through" : "text-fg/90"}`}>
            {item.text}
            {item.due && (
              <span className="ml-2 chip tabular-nums" style={{ background: "var(--due-soft)", color: "var(--due-ink)", borderColor: "transparent" }}>
                due {item.due}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-2xs text-muted">{item.meetingTitle}</div>
        </div>
      </div>
    </Link>
  );
}

function Kpi({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="card lift flex min-h-[80px] flex-col items-center justify-center p-4 text-center">
      <div className="text-2xl font-bold" style={{ color: "var(--accent-2)" }}>
        {value}
      </div>
      <div className="eyebrow mt-1 text-muted">{label}</div>
    </div>
  );
}
