"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AccountHub } from "@/lib/accounts";
import { customerHue, initials } from "@/lib/customerHues";
import { SearchIcon } from "./icons";
import AccountNumberEditor from "./AccountNumberEditor";

type Filter = "all" | "open" | "overdue";
type Tab = "overview" | "contacts" | "meetings";

// Phase: master-detail Accounts page matching the Film Room design handoff.
// A searchable/filterable account list on the left; a tabbed detail pane on the
// right (Overview / Contacts / Meetings). Selection is client-side; all data is
// assembled server-side in getAccountsHub, so switching accounts is instant.
export default function AccountsHub({
  accounts,
  today,
  initialSlug,
}: {
  accounts: AccountHub[];
  today: string;
  initialSlug?: string;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [slug, setSlug] = useState(initialSlug ?? accounts[0]?.slug ?? "");
  const [tab, setTab] = useState<Tab>("overview");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filter === "open" && a.openTaskCount === 0) return false;
      if (filter === "overdue" && a.overdueCount === 0) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        (a.region ?? "").toLowerCase().includes(needle) ||
        (a.accountNumber ?? "").toLowerCase().includes(needle)
      );
    });
  }, [accounts, q, filter]);

  const selected =
    accounts.find((a) => a.slug === slug) ?? filtered[0] ?? accounts[0] ?? null;

  return (
    <div className="flex flex-col items-start gap-4 lg:flex-row">
      {/* LIST */}
      <div className="card w-full flex-none p-3.5 lg:w-[320px]">
        <div className="relative mb-1.5">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${accounts.length} accounts…`}
            className="input w-full pl-8"
          />
        </div>
        <div className="flex items-center gap-1.5 px-1 py-2.5">
          {(["all", "open", "overdue"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-full px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide transition-colors"
              style={
                filter === f
                  ? { color: "var(--accent)", background: "var(--accent-soft)" }
                  : { color: "var(--ink-3)" }
              }
            >
              {f === "all" ? "All" : f === "open" ? "Open tasks" : "Overdue"}
            </button>
          ))}
        </div>
        <div className="flex max-h-[620px] flex-col gap-0.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">No accounts match.</p>
          ) : (
            filtered.map((a) => (
              <AccountRow
                key={a.slug}
                a={a}
                active={selected?.slug === a.slug}
                onSelect={() => {
                  setSlug(a.slug);
                  setTab("overview");
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* DETAIL */}
      <div className="card w-full flex-1 overflow-hidden p-0">
        {selected ? (
          <Detail account={selected} today={today} tab={tab} setTab={setTab} />
        ) : (
          <p className="p-8 text-sm text-muted">No account selected.</p>
        )}
      </div>
    </div>
  );
}

function AccountRow({
  a,
  active,
  onSelect,
}: {
  a: AccountHub;
  active: boolean;
  onSelect: () => void;
}) {
  const { hue, soft } = customerHue(a.name);
  const meta =
    a.overdueCount > 0
      ? `${a.overdueCount} overdue · ${a.openTaskCount} open`
      : a.openTaskCount > 0
        ? `${a.openTaskCount} open`
        : a.region || a.type || "No open work";
  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-surface2"
      style={active ? { background: "var(--surface-2)" } : undefined}
    >
      <span
        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[11px] font-bold"
        style={{ background: soft, color: hue }}
      >
        {initials(a.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{a.name}</span>
        <span
          className="block truncate text-2xs font-medium"
          style={{ color: a.overdueCount > 0 ? "var(--due)" : "var(--ink-3)" }}
        >
          {meta}
        </span>
      </span>
    </button>
  );
}

function Detail({
  account: a,
  today,
  tab,
  setTab,
}: {
  account: AccountHub;
  today: string;
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  const { hue, soft } = customerHue(a.name);
  const tiles: { v: string | number; l: string; c?: string }[] = [
    { v: a.openTaskCount, l: "Open" },
    { v: a.overdueCount, l: "Overdue", c: a.overdueCount > 0 ? "var(--due)" : undefined },
    { v: a.contacts.length, l: "Contacts" },
    { v: a.recentMeetings.length, l: "Meetings" },
  ];

  return (
    <div>
      {/* header */}
      <div className="relative overflow-hidden border-b p-6 sm:p-7" style={{ borderColor: "var(--line)" }}>
        <div
          className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full"
          style={{ background: `radial-gradient(closest-side, ${soft}, transparent)` }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              className="flex h-12 w-12 flex-none items-center justify-center rounded-xl text-base font-bold"
              style={{ background: soft, color: hue }}
            >
              {initials(a.name)}
            </span>
            <div>
              <h2 className="text-[23px] font-bold tracking-tight text-fg">{a.name}</h2>
              <p className="mt-0.5 text-xs text-ink3">
                {[a.type, a.region].filter(Boolean).join(" · ") || "Customer account"}
              </p>
            </div>
          </div>
          <AccountNumberEditor path={a.path} initial={a.accountNumber} />
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2.5">
          {tiles.map((t) => (
            <div
              key={t.l}
              className="flex items-baseline gap-1.5 rounded-[11px] border px-3.5 py-2"
              style={{ background: "var(--surface-2)", borderColor: "var(--line)" }}
            >
              <span className="text-[17px] font-bold" style={{ color: t.c ?? "var(--accent-2)" }}>
                {t.v}
              </span>
              <span className="text-2xs font-medium text-ink3">{t.l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b px-6" style={{ borderColor: "var(--line)" }}>
        {(["overview", "contacts", "meetings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="-mb-px border-b-2 px-3 py-3 text-sm font-medium capitalize transition-colors"
            style={
              tab === t
                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                : { borderColor: "transparent", color: "var(--ink-3)" }
            }
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-6 sm:p-7">
        {tab === "overview" && <Overview a={a} today={today} />}
        {tab === "contacts" && <Contacts a={a} />}
        {tab === "meetings" && <Meetings a={a} />}
      </div>
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow mb-2 text-ink3">{children}</div>
  );
}

function Overview({ a, today }: { a: AccountHub; today: string }) {
  return (
    <div className="grid gap-7 md:grid-cols-[1.5fr_1fr]">
      <div>
        <Kicker>Open tasks</Kicker>
        {a.openTasks.length === 0 ? (
          <p className="text-sm text-muted">No open tasks.</p>
        ) : (
          <div className="flex flex-col">
            {a.openTasks.slice(0, 8).map((t, i) => (
              <div key={i} className="flex items-start gap-3 border-b py-3" style={{ borderColor: "var(--line)" }}>
                <span
                  className="mt-0.5 h-4 w-4 flex-none rounded-[5px] border-2"
                  style={{ borderColor: "var(--line-2)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug text-fg">{t.text}</div>
                  {(t.due || t.priority) && (
                    <div className="mt-1 flex items-center gap-2">
                      {t.due && (
                        <span
                          className="chip tabular-nums"
                          style={
                            t.overdue
                              ? { background: "var(--due-soft)", color: "var(--due-ink)", borderColor: "transparent" }
                              : { borderColor: "var(--line-2)" }
                          }
                        >
                          {t.overdue ? "overdue " : "due "}
                          {t.due}
                        </span>
                      )}
                      {t.priority && (
                        <span className="chip" style={{ borderColor: "var(--line-2)" }}>
                          {t.priority}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {a.openTasks.length > 8 && (
              <p className="mt-2 text-2xs text-muted">+ {a.openTasks.length - 8} more</p>
            )}
          </div>
        )}

        <div className="mt-6">
          <Kicker>Recent meetings</Kicker>
          <MeetingRows a={a} limit={3} />
        </div>
      </div>

      <div>
        <Kicker>Primary contacts</Kicker>
        {a.contacts.length === 0 ? (
          <p className="text-sm text-muted">None listed.</p>
        ) : (
          a.contacts.slice(0, 3).map((c) => <ContactRow key={c.name} c={c} compact />)
        )}

        <div className="mt-6">
          <Kicker>Snapshot</Kicker>
          {[
            { label: "Account #", value: a.accountNumber || "Not assigned" },
            { label: "Type", value: a.type || "—" },
            { label: "Region", value: a.region || "—" },
            { label: "Stage", value: a.stage || a.status || "—" },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between border-b py-2.5"
              style={{ borderColor: "var(--line)" }}
            >
              <span className="text-xs text-ink3">{s.label}</span>
              <span className="text-[13px] font-semibold text-fg">{s.value}</span>
            </div>
          ))}
          <p className="mt-2 text-2xs text-muted">As of {today}.</p>
        </div>
      </div>
    </div>
  );
}

function Contacts({ a }: { a: AccountHub }) {
  if (a.contacts.length === 0)
    return <p className="text-sm text-muted">No contacts listed on this account note.</p>;
  return (
    <div className="flex flex-col">
      {a.contacts.map((c) => (
        <ContactRow key={c.name} c={c} />
      ))}
    </div>
  );
}

function ContactRow({
  c,
  compact,
}: {
  c: AccountHub["contacts"][number];
  compact?: boolean;
}) {
  const { hue, soft } = customerHue(c.name);
  return (
    <div
      className={`flex items-center gap-3.5 ${compact ? "py-2.5" : "border-b py-3.5"}`}
      style={compact ? undefined : { borderColor: "var(--line)" }}
    >
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-[11px] font-bold"
        style={{ background: soft, color: hue }}
      >
        {initials(c.name)}
      </span>
      <div className="w-52 flex-none">
        <div className="truncate text-sm font-semibold text-fg">{c.name}</div>
        {c.detail && <div className="truncate text-xs text-ink3">{c.detail}</div>}
      </div>
      {c.email && (
        <a
          href={`mailto:${c.email}`}
          className="min-w-0 flex-1 truncate text-[13px]"
          style={{ color: "var(--accent-2)" }}
        >
          {c.email}
        </a>
      )}
    </div>
  );
}

function Meetings({ a }: { a: AccountHub }) {
  if (a.recentMeetings.length === 0)
    return <p className="text-sm text-muted">No meetings filed under this account.</p>;
  return <MeetingRows a={a} limit={a.recentMeetings.length} />;
}

function MeetingRows({ a, limit }: { a: AccountHub; limit: number }) {
  if (a.recentMeetings.length === 0)
    return <p className="text-sm text-muted">None yet.</p>;
  const { hue, soft } = customerHue(a.name);
  return (
    <div className="flex flex-col gap-2">
      {a.recentMeetings.slice(0, limit).map((m, i) => {
        const inner = (
          <>
            <span
              className="flex-none rounded-md px-2 py-1 text-2xs font-bold tabular-nums"
              style={{ background: soft, color: hue }}
            >
              {m.date}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{m.title}</span>
            {m.notePath && <span className="text-xs font-semibold text-ink3">Open →</span>}
          </>
        );
        return m.notePath ? (
          <Link
            key={i}
            href={`/meetings?note=${encodeURIComponent(m.notePath)}`}
            className="lift flex items-center gap-3 rounded-[10px] border px-3 py-2.5"
            style={{ borderColor: "var(--line)" }}
          >
            {inner}
          </Link>
        ) : (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[10px] border px-3 py-2.5"
            style={{ borderColor: "var(--line)" }}
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}
