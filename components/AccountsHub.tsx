"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountHub } from "@/lib/accounts";
import { accountToEditable, type EditableContact } from "@/lib/accountEdit";
import { customerHue, initials } from "@/lib/customerHues";
import { SearchIcon } from "./icons";
import AccountNumberEditor from "./AccountNumberEditor";
import DocumentLibrary from "./DocumentLibrary";

type Filter = "all" | "open" | "overdue";
type Tab =
  | "overview"
  | "contacts"
  | "quotes"
  | "tasks"
  | "projects"
  | "pricing"
  | "quality"
  | "pcns"
  | "meetings";

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
    <div className="flex flex-col items-start gap-5 lg:flex-row">
      {/* LIST */}
      <div className="card w-full flex-none p-3.5 lg:sticky lg:top-6 lg:w-[340px]">
        <NewAccountForm
          onCreated={(s) => {
            setSlug(s);
            setTab("overview");
          }}
        />
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
        <div className="flex max-h-[calc(100vh-220px)] flex-col gap-0.5 overflow-y-auto">
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
  const [editing, setEditing] = useState(false);
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
          <div className="flex items-center gap-2">
            <AccountNumberEditor path={a.path} initial={a.accountNumber} />
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="btn btn-ghost px-3 py-1 text-xs"
              >
                Edit
              </button>
            )}
          </div>
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

      {editing ? (
        <AccountEditor account={a} onClose={() => setEditing(false)} />
      ) : (
        <>
          {/* tabs */}
          <div className="flex gap-1 overflow-x-auto border-b px-6" style={{ borderColor: "var(--line)" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => t.enabled && setTab(t.key)}
                disabled={!t.enabled}
                className="-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors disabled:opacity-40"
                style={
                  tab === t.key
                    ? { borderColor: "var(--accent)", color: "var(--accent)" }
                    : { borderColor: "transparent", color: "var(--ink-3)" }
                }
                title={t.enabled ? undefined : "Coming soon"}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6 sm:p-7">
            {tab === "overview" && <Overview a={a} today={today} />}
            {tab === "contacts" && <Contacts a={a} />}
            {tab === "meetings" && <Meetings a={a} />}
            {tab === "tasks" && <TasksTab a={a} today={today} />}
            {tab === "quotes" && (
              <DocumentLibrary account={a.name} allowedTypes={["quote"]} compact />
            )}
            {tab === "quality" && (
              <DocumentLibrary
                account={a.name}
                allowedTypes={["iso", "biocomp", "cert", "drawing", "spec"]}
                compact
              />
            )}
            {tab === "pcns" && (
              <DocumentLibrary account={a.name} allowedTypes={["pcn"]} compact />
            )}
            {PLACEHOLDER_TABS.includes(tab) && <Placeholder label={tabLabel(tab)} />}
          </div>
        </>
      )}
    </div>
  );
}

const TABS: { key: Tab; label: string; enabled: boolean }[] = [
  { key: "overview", label: "Overview", enabled: true },
  { key: "contacts", label: "Contacts", enabled: true },
  { key: "quotes", label: "Quotes", enabled: true },
  { key: "tasks", label: "Tasks", enabled: true },
  { key: "projects", label: "Open projects", enabled: false },
  { key: "pricing", label: "Pricing", enabled: false },
  { key: "quality", label: "Quality", enabled: true },
  { key: "pcns", label: "OEM PCNs", enabled: true },
  { key: "meetings", label: "Meetings", enabled: true },
];

const PLACEHOLDER_TABS: Tab[] = ["projects", "pricing"];

function tabLabel(t: Tab): string {
  return TABS.find((x) => x.key === t)?.label ?? t;
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="rounded-[12px] border border-dashed p-8 text-center" style={{ borderColor: "var(--line-2)" }}>
      <div className="text-sm font-medium text-fg">{label}</div>
      <p className="mt-1 text-sm text-muted">
        Coming soon. This tab will surface {label.toLowerCase()} once the data is wired in.
      </p>
    </div>
  );
}

function TasksTab({ a, today }: { a: AccountHub; today: string }) {
  if (a.openTasks.length === 0)
    return <p className="text-sm text-muted">No open tasks for this account.</p>;
  return (
    <div className="flex flex-col">
      {a.openTasks.map((t, i) => {
        const overdue = !!t.due && t.due < today;
        return (
          <div key={i} className="flex items-start gap-3 border-b py-3" style={{ borderColor: "var(--line)" }}>
            <span className="mt-0.5 h-4 w-4 flex-none rounded-[5px] border-2" style={{ borderColor: "var(--line-2)" }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-fg">{t.text}</div>
              {t.due && (
                <div className="mt-1 text-2xs tabular-nums" style={{ color: overdue ? "var(--due)" : "var(--ink-3)" }}>
                  {overdue ? "overdue " : "due "}
                  {t.due}
                </div>
              )}
            </div>
            {t.priority && (
              <span className="chip" style={{ borderColor: "var(--line-2)" }}>{t.priority}</span>
            )}
          </div>
        );
      })}
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
  return (
    <div>
      <AddContactForm path={a.path} />
      {a.contacts.length === 0 ? (
        <p className="text-sm text-muted">No contacts listed on this account yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {a.contacts.map((c) => (
            <ContactCard key={c.name} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// Manually add a contact to the selected account. Calls the same writer the
// review queue and meeting executor use, so the row lands DB-first with
// provenance and shows up everywhere the account's contacts render.
function AddContactForm({ path }: { path: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          name: name.trim(),
          title: title.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        added?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `Add failed (${res.status}).`);
      if (!data.added?.length) throw new Error("That contact is already on this account.");
      setOpen(false);
      setName("");
      setTitle("");
      setEmail("");
      setBusy(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-3 flex justify-end">
        <button onClick={() => setOpen(true)} className="btn btn-ghost px-3 py-1.5 text-xs">
          + Add contact
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-3 p-4" style={{ borderLeft: "3px solid var(--accent)" }}>
      <h3 className="mb-3 text-sm font-bold text-fg">Add contact</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alice Smith"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Title (optional)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Supply Chain Manager"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Email (optional)
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alice@example.com"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={add}
          disabled={busy || !name.trim()}
          className="btn btn-primary px-3 py-1.5 text-xs"
        >
          {busy ? "Adding…" : "Add contact"}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Manually add a customer account. Calls the same createAccount writer the
// people review queue uses (DB-first post-cutover, origin "app"); the new
// account is selected once the refresh lands.
function NewAccountForm({ onCreated }: { onCreated: (slug: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          accountNumber: accountNumber.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        slug?: string;
        error?: string;
      };
      if (!res.ok || !data.slug) throw new Error(data.error || `Create failed (${res.status}).`);
      setOpen(false);
      setName("");
      setAccountNumber("");
      setNote("");
      setBusy(false);
      onCreated(data.slug);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-2 flex justify-end">
        <button onClick={() => setOpen(true)} className="btn btn-ghost px-3 py-1.5 text-xs">
          + New account
        </button>
      </div>
    );
  }

  return (
    <div
      className="mb-3 rounded-md border p-3"
      style={{ borderColor: "var(--line-2)", borderLeft: "3px solid var(--accent)" }}
    >
      <h3 className="mb-2 text-sm font-bold text-fg">New account</h3>
      <div className="grid gap-2">
        <label className="text-xs font-semibold text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Medical"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Account number (optional)
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="10-12345"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Note (optional, lands in Overview)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Met at trade show, wants VAC pricing"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="btn btn-primary px-3 py-1.5 text-xs"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

// A proper contact card: avatar + name, a role line, then labeled email/phone
// rows, and any free-text detail as its own "Notes" block (not a parenthetical).
function ContactCard({ c }: { c: AccountHub["contacts"][number] }) {
  const { hue, soft } = customerHue(c.name);
  // The parser puts a job title in `title`; free text about the person sits in
  // `detail`. Show the title as the role; show distinct detail as notes.
  const role = c.title;
  const notes = c.detail && c.detail !== c.title ? c.detail : undefined;
  const tel = c.phone ? `tel:${c.phone.replace(/[^\d+]/g, "")}` : undefined;
  return (
    <div className="rounded-[14px] border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-sm font-bold"
          style={{ background: soft, color: hue }}
        >
          {initials(c.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight text-fg">{c.name}</div>
          {role && <div className="mt-0.5 text-xs text-ink3">{role}</div>}
        </div>
      </div>
      <div className="mt-3 grid gap-1.5">
        <ContactLine label="Email" value={c.email} href={c.email ? `mailto:${c.email}` : undefined} />
        <ContactLine label="Phone" value={c.phone} href={tel} />
      </div>
      {notes && (
        <div className="mt-3 border-t pt-2.5" style={{ borderColor: "var(--line)" }}>
          <div className="eyebrow mb-1 text-ink3">Notes</div>
          <p className="text-[13px] leading-relaxed text-fg/80">{notes}</p>
        </div>
      )}
    </div>
  );
}

function ContactLine({ label, value, href }: { label: string; value?: string; href?: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <span className="w-12 flex-none text-2xs uppercase tracking-wide text-ink3">{label}</span>
      {value ? (
        href ? (
          <a href={href} className="min-w-0 break-words font-medium" style={{ color: "var(--accent-2)" }}>
            {value}
          </a>
        ) : (
          <span className="min-w-0 break-words font-medium text-fg">{value}</span>
        )
      ) : (
        <span className="text-muted">Not on file</span>
      )}
    </div>
  );
}

// Compact contact row for the Overview "primary contacts" list.
function ContactRow({
  c,
  compact,
}: {
  c: AccountHub["contacts"][number];
  compact?: boolean;
}) {
  const { hue, soft } = customerHue(c.name);
  const role = c.title;
  return (
    <div
      className={`flex items-center gap-3 ${compact ? "py-2" : "border-b py-3.5"}`}
      style={compact ? undefined : { borderColor: "var(--line)" }}
    >
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-[11px] font-bold"
        style={{ background: soft, color: hue }}
      >
        {initials(c.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-fg">{c.name}</div>
        {role && <div className="truncate text-xs text-ink3">{role}</div>}
      </div>
    </div>
  );
}

// ---- account editor (edit mode) ----

interface ContactRowEdit extends EditableContact {
  _id: number;
}

function AccountEditor({ account: a, onClose }: { account: AccountHub; onClose: () => void }) {
  const router = useRouter();
  const initial = accountToEditable(a);
  const [type, setType] = useState(initial.type ?? "");
  const [region, setRegion] = useState(initial.region ?? "");
  const [stage, setStage] = useState(initial.stage ?? "");
  const [status, setStatus] = useState(initial.status ?? "");
  const [accountNumber, setAccountNumber] = useState(initial.accountNumber ?? "");
  const [overview, setOverview] = useState(initial.overview);
  const [contacts, setContacts] = useState<ContactRowEdit[]>(
    initial.contacts.map((c, i) => ({ ...c, _id: i })),
  );
  const [nextId, setNextId] = useState(initial.contacts.length);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function patch(id: number, p: Partial<ContactRowEdit>) {
    setContacts((prev) => prev.map((c) => (c._id === id ? { ...c, ...p } : c)));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const edit = {
      type: type.trim() || undefined,
      region: region.trim() || undefined,
      stage: stage.trim() || undefined,
      status: status.trim() || undefined,
      accountNumber: accountNumber.trim() || undefined,
      overview,
      contacts: contacts
        .filter((c) => c.name.trim())
        .map(({ _id, ...rest }) => {
          void _id;
          return rest;
        }),
    };
    try {
      const res = await fetch("/api/accounts/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: a.path, edit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not save.");
      } else {
        onClose();
        router.refresh();
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <EditField label="Type" value={type} onChange={setType} placeholder="OEM Account" />
        <EditField label="Account #" value={accountNumber} onChange={setAccountNumber} placeholder="e.g. 69249" />
        <EditField label="Region" value={region} onChange={setRegion} placeholder="Pacific OEM" />
        <EditField label="Stage" value={stage} onChange={setStage} placeholder="Strategic / Growth / Core" />
        <EditField label="Status" value={status} onChange={setStatus} placeholder="active" />
      </div>

      <div className="mt-5">
        <p className="eyebrow mb-1.5 text-muted">Overview</p>
        <textarea
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
          className="input min-h-[90px] w-full"
          placeholder="What this account is, the relationship, what matters."
        />
      </div>

      <div className="mt-6">
        <p className="eyebrow mb-2 text-muted">Contacts</p>
        <div className="grid gap-2">
          {contacts.map((c) => (
            <div
              key={c._id}
              className="grid gap-2 rounded-[12px] border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
              style={{ borderColor: "var(--line)" }}
            >
              <input className="input" placeholder="Name" value={c.name} onChange={(e) => patch(c._id, { name: e.target.value })} />
              <input className="input" placeholder="Title" value={c.title ?? ""} onChange={(e) => patch(c._id, { title: e.target.value })} />
              <input className="input" placeholder="Email" value={c.email ?? ""} onChange={(e) => patch(c._id, { email: e.target.value })} />
              <input className="input" placeholder="Phone" value={c.phone ?? ""} onChange={(e) => patch(c._id, { phone: e.target.value })} />
              <button
                onClick={() => setContacts((prev) => prev.filter((x) => x._id !== c._id))}
                className="text-muted hover:text-danger"
                aria-label="Remove contact"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            setContacts((prev) => [...prev, { _id: nextId, name: "" }]);
            setNextId((n) => n + 1);
          }}
          className="btn btn-ghost mt-2 px-2.5 py-1 text-xs"
        >
          + Contact
        </button>
      </div>

      {err && <p className="mt-4 text-sm text-danger">{err}</p>}

      <div className="mt-6 flex items-center gap-2 border-t-2 pt-4" style={{ borderColor: "var(--accent)" }}>
        <button onClick={save} disabled={busy} className="btn btn-primary disabled:opacity-60">
          {busy ? "Saving…" : "Save to vault"}
        </button>
        <button onClick={onClose} disabled={busy} className="btn btn-ghost">
          Cancel
        </button>
        <span className="ml-auto text-2xs text-muted">Writes one commit to the account note.</span>
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="eyebrow mb-1.5 text-muted">{label}</p>
      <input className="input w-full" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
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
