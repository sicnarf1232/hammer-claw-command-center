"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { customerHue, initials, isInternalBucket } from "@/lib/customerHues";
import SuggestedSeries, { type HubCandidate } from "@/components/SuggestedSeries";
import NewSeriesForm from "@/components/NewSeriesForm";

export interface HubRow {
  date: string; // YYYY-MM-DD
  bucket: string;
  title: string;
  notePath: string | null;
}
export interface HubSeries {
  name: string;
  path: string;
  cadence?: string;
  sessions: number;
  latest?: string;
}

type View = "all" | "customers" | "series" | "month";
const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "customers", label: "Customers" },
  { key: "series", label: "Series" },
  { key: "month", label: "Month" },
];

const normName = (s: string) => s.trim().toLowerCase();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthDay = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""} ${Number(d.slice(8, 10))}`;
const year = (d: string) => d.slice(0, 4);
const monthLabel = (ym: string) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;

export default function MeetingsHub({
  rows,
  series = [],
  candidates = [],
  accountNames = [],
  today = "",
}: {
  rows: HubRow[];
  series?: HubSeries[];
  candidates?: HubCandidate[];
  accountNames?: string[];
  today?: string;
}) {
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [tile, setTile] = useState<string>("all"); // active tile key

  const linkedSet = useMemo(
    () => new Set(accountNames.map(normName)),
    [accountNames],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.bucket.toLowerCase().includes(q) ||
        r.date.includes(q),
    );
  }, [rows, query]);

  const customers = useMemo(() => distinctBuckets(rows), [rows]);

  // Past meetings the New Series form can seed from (rows arrive newest first).
  const seedMeetings = useMemo(
    () =>
      rows
        .filter((r): r is HubRow & { notePath: string } => !!r.notePath)
        .map((r) => ({ title: r.title, date: r.date, path: r.notePath })),
    [rows],
  );

  function pickView(v: View) {
    setView(v);
    setTile("all");
  }

  return (
    <div>
      {/* Hero */}
      <section className="panel texture mb-6 overflow-hidden p-7">
        <span
          className="chip mb-4 border-transparent"
          style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
        >
          ● Synced from vault · just now
        </span>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[580px]">
            <div
              className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--accent)" }}
            >
              ✦ Film Room
            </div>
            <h1 className="text-[36px] font-bold leading-[1.02] tracking-tight text-fg">
              All Meetings
            </h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink2">
              Every conversation across customers and rolling series, grouped,
              deduped, and ready to brief in seconds.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Stat n={rows.length} label="meetings" />
          <Stat n={customers.length} label="customers" />
          <Stat n={series.length} label="rolling series" />
        </div>
      </section>

      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 rounded-[12px] border p-0.5" style={{ borderColor: "var(--line-2)" }}>
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => pickView(v.key)}
              className="rounded-[10px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
              style={
                view === v.key
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : { color: "var(--ink-2)" }
              }
            >
              {v.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${rows.length} meetings…`}
          className="input w-64 max-w-full"
        />
      </div>

      {/* All view: a quick-reference of recent meetings + fun stats */}
      {view === "all" && !query && (
        <HotAndStats rows={rows} series={series} customers={customers} today={today} />
      )}

      {/* Set up a series by hand, ahead of any meetings, or seed one from
          selected past meetings (Opus derives the fields) */}
      {view === "series" && (
        <NewSeriesForm accountNames={accountNames} recentMeetings={seedMeetings} />
      )}

      {/* Suggested series: recurring meetings not yet a rolling series */}
      {view === "series" && <SuggestedSeries candidates={candidates} />}

      {/* Tile rail */}
      {view !== "all" && (
        <TileRail
          view={view}
          rows={filtered}
          customers={customers}
          series={series}
          tile={tile}
          setTile={setTile}
        />
      )}

      {/* Feed */}
      <Feed view={view} rows={filtered} series={series} tile={tile} linked={linkedSet} />
    </div>
  );
}

// A rolling-series tile with a two-step delete (the notes stay; only the
// rolling doc and its linkage are removed).
function SeriesTile({ s }: { s: HubSeries }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/series/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: s.path }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="group relative w-[238px] shrink-0">
      <Link
        href={`/meetings?series=${encodeURIComponent(s.path)}`}
        className="card lift block p-4"
      >
        <Avatar label={initials(s.name)} hue="var(--accent)" soft="var(--accent-soft)" />
        <div className="mt-3 truncate text-sm font-semibold text-fg">{s.name}</div>
        <div className="mt-0.5 text-xs text-muted">
          {s.sessions} session{s.sessions === 1 ? "" : "s"}
          {s.latest ? ` · latest ${monthDay(s.latest)}` : ""}
        </div>
      </Link>
      {confirming ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface/95 p-3 text-center">
          <div className="text-xs font-semibold text-fg">Delete this series?</div>
          <div className="text-2xs text-muted">
            The meeting notes stay; only the rolling doc goes.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-lg px-2.5 py-1 text-2xs font-bold text-white disabled:opacity-60"
              style={{ background: "var(--due)" }}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg border border-border px-2.5 py-1 text-2xs text-fg/70"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title="Delete series"
          aria-label="Delete series"
          className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-fg group-hover:flex"
        >
          ×
        </button>
      )}
    </div>
  );
}

function HotAndStats({
  rows,
  series,
  customers,
  today,
}: {
  rows: HubRow[];
  series: HubSeries[];
  customers: string[];
  today: string;
}) {
  const recent = useMemo(
    () => [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5),
    [rows],
  );
  const stats = useMemo(() => {
    const ym = today.slice(0, 7);
    const thisMonth = ym ? rows.filter((r) => r.date.startsWith(ym)).length : 0;
    // busiest customer (exclude internal)
    const byCust = new Map<string, number>();
    for (const r of rows) {
      if (isInternalBucket(r.bucket)) continue;
      byCust.set(r.bucket, (byCust.get(r.bucket) ?? 0) + 1);
    }
    let busiest = "—";
    let busiestN = 0;
    for (const [c, n] of byCust) if (n > busiestN) ((busiest = c), (busiestN = n));
    // span in weeks for a rough cadence
    const dates = rows.map((r) => r.date).sort();
    let perWeek = 0;
    if (dates.length > 1) {
      const days =
        (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000;
      perWeek = days > 0 ? rows.length / (days / 7) : 0;
    }
    const topSeries = [...series].sort((a, b) => b.sessions - a.sessions)[0];
    return { thisMonth, busiest, busiestN, perWeek, topSeries };
  }, [rows, series, today]);

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      {/* Jump back in */}
      <section className="card p-4 lg:col-span-2">
        <p className="eyebrow mb-2.5 text-muted">Jump back in</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {recent.map((r, i) => {
            const { hue } = customerHue(r.bucket);
            const inner = (
              <div className="card lift flex items-center gap-3 p-2.5" style={{ borderLeft: `3px solid ${hue}` }}>
                <div className="w-11 shrink-0 text-center">
                  <div className="text-xs font-bold leading-tight" style={{ color: hue }}>{monthDay(r.date)}</div>
                  <div className="text-2xs text-muted">{year(r.date)}</div>
                </div>
                <div className="min-w-0">
                  <div className="eyebrow text-[10px]" style={{ color: hue }}>{isInternalBucket(r.bucket) ? "Internal" : r.bucket}</div>
                  <div className="truncate text-[13px] font-semibold text-fg">{r.title}</div>
                </div>
              </div>
            );
            return r.notePath ? (
              <Link key={`${r.date}-${i}`} href={`/meetings?note=${encodeURIComponent(r.notePath)}`}>{inner}</Link>
            ) : (
              <div key={`${r.date}-${i}`}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* Fun stats */}
      <section className="card p-4">
        <p className="eyebrow mb-2.5 text-muted">By the numbers</p>
        <div className="grid grid-cols-2 gap-2.5 text-center">
          <FactBox value={rows.length} label="meetings" />
          <FactBox value={stats.thisMonth} label="this month" />
          <FactBox value={customers.length} label="customers" />
          <FactBox value={series.length} label="series" />
        </div>
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
          <FactRow label="Busiest customer" value={stats.busiest === "—" ? "—" : `${stats.busiest} (${stats.busiestN})`} />
          <FactRow label="Pace" value={stats.perWeek ? `${stats.perWeek.toFixed(1)} / week` : "—"} />
          {stats.topSeries && (
            <FactRow label="Top series" value={`${stats.topSeries.name} (${stats.topSeries.sessions})`} />
          )}
        </dl>
      </section>
    </div>
  );
}

function FactBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-[10px] p-2" style={{ background: "var(--surface-2)" }}>
      <div className="text-xl font-bold" style={{ color: "var(--accent-2)" }}>{value}</div>
      <div className="text-2xs text-muted">{label}</div>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-right font-medium text-fg">{value}</dd>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className="chip" style={{ borderColor: "var(--line-2)" }}>
      <strong className="text-fg">{n}</strong>
      <span className="text-muted">{label}</span>
    </span>
  );
}

function TileRail({
  view,
  rows,
  customers,
  series,
  tile,
  setTile,
}: {
  view: View;
  rows: HubRow[];
  customers: string[];
  series: HubSeries[];
  tile: string;
  setTile: (t: string) => void;
}) {
  if (view === "series") {
    return (
      <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
        {series.map((s) => (
          <SeriesTile key={s.path} s={s} />
        ))}
        {series.length === 0 && (
          <div className="text-sm text-muted">No rolling series yet.</div>
        )}
      </div>
    );
  }

  const tiles =
    view === "customers"
      ? customers.map((c) => ({ key: c, label: c, rows: rows.filter((r) => r.bucket === c) }))
      : monthsOf(rows).map((m) => ({ key: m, label: monthLabel(`${m}-01`), rows: rows.filter((r) => r.date.startsWith(m)) }));

  return (
    <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
      <Tile
        active={tile === "all"}
        onClick={() => setTile("all")}
        label="All Meetings"
        meta={`${rows.length} meetings`}
        hue="var(--accent)"
        soft="var(--accent-soft)"
        initialsText="◆"
      />
      {tiles.map((t) => {
        const { hue, soft } = view === "customers" ? customerHue(t.key) : { hue: "var(--accent)", soft: "var(--accent-soft)" };
        const last = t.rows.reduce((m, r) => (r.date > m ? r.date : m), "");
        return (
          <Tile
            key={t.key}
            active={tile === t.key}
            onClick={() => setTile(t.key)}
            label={t.label}
            meta={`${t.rows.length} meeting${t.rows.length === 1 ? "" : "s"}${last ? ` · last ${monthDay(last)}` : ""}`}
            hue={hue}
            soft={soft}
            initialsText={view === "customers" ? initials(t.key) : t.label.slice(0, 3)}
          />
        );
      })}
    </div>
  );
}

function Tile({
  active,
  onClick,
  label,
  meta,
  hue,
  soft,
  initialsText,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  meta: string;
  hue: string;
  soft: string;
  initialsText: string;
}) {
  return (
    <button
      onClick={onClick}
      className="card lift w-[238px] shrink-0 p-4 text-left"
      style={active ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}
    >
      <Avatar label={initialsText} hue={hue} soft={soft} />
      <div className="mt-3 truncate text-sm font-semibold text-fg">{label}</div>
      <div className="mt-0.5 truncate text-xs text-muted">{meta}</div>
    </button>
  );
}

function Avatar({ label, hue, soft }: { label: string; hue: string; soft: string }) {
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-[10px] text-xs font-bold"
      style={{ background: soft, color: hue }}
    >
      {label}
    </span>
  );
}

function Feed({
  view,
  rows,
  series,
  tile,
  linked,
}: {
  view: View;
  rows: HubRow[];
  series: HubSeries[];
  tile: string;
  linked: Set<string>;
}) {
  // All view: a month accordion — newest month open, older months collapsed.
  if (view === "all") {
    const months = monthsOf(rows).filter(Boolean);
    if (!months.length) {
      return <div className="card max-w-2xl p-6 text-center text-sm text-muted">No meetings match.</div>;
    }
    return (
      <div className="grid gap-3">
        {months.map((ym, i) => {
          const mrows = rows
            .filter((r) => r.date.startsWith(ym))
            .sort((a, b) => (a.date < b.date ? 1 : -1));
          return (
            <details key={ym} open={i === 0} className="card overflow-hidden p-0">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-sm font-bold text-fg">
                {monthLabel(`${ym}-01`)}
                <span className="chip" style={{ borderColor: "var(--line-2)" }}>{mrows.length}</span>
              </summary>
              <div className="grid gap-2 px-3.5 pb-3.5">
                {mrows.map((r, j) => (
                  <MeetingRow key={`${r.date}-${j}`} row={r} linked={linked} />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  if (view === "series") {
    return (
      <div className="grid gap-2">
        <p className="eyebrow mb-1 text-muted">Showing all rolling series</p>
        {series.map((s) => (
          <Link
            key={s.path}
            href={`/meetings?series=${encodeURIComponent(s.path)}`}
            className="card lift flex items-center justify-between gap-3 p-3.5"
            style={{ borderLeft: "3px solid var(--accent)" }}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg">{s.name}</div>
              <div className="mt-0.5 text-xs text-muted">
                {s.cadence ? `${s.cadence} · ` : ""}
                {s.sessions} session{s.sessions === 1 ? "" : "s"}
                {s.latest ? ` · latest ${monthDay(s.latest)}` : ""}
              </div>
            </div>
            <span className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
              Open →
            </span>
          </Link>
        ))}
      </div>
    );
  }

  const visible = tile === "all" ? rows : rows.filter((r) => (view === "customers" ? r.bucket === tile : r.date.startsWith(tile)));
  const groups = groupRows(visible, view, tile);
  const groupingLabel = `grouped by ${view}`;

  if (groups.length === 0) {
    return <div className="card max-w-2xl p-6 text-center text-sm text-muted">No meetings match.</div>;
  }

  return (
    <div>
      <p className="eyebrow mb-3 text-muted">
        {tile === "all" ? "Showing all" : "Filtered"} · {groupingLabel}
      </p>
      <div className="grid gap-6">
        {groups.map((g) => (
          <section key={g.key}>
            {g.label && (
              <div className="mb-2.5 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.hue ?? "var(--accent)" }} />
                <h3 className="text-sm font-bold text-fg">{g.label}</h3>
                <span className="chip" style={{ borderColor: "var(--line-2)" }}>{g.rows.length}</span>
                {g.last && <span className="text-xs text-muted">last met {monthDay(g.last)}</span>}
              </div>
            )}
            <div className="grid gap-2">
              {g.rows.map((r, i) => (
                <MeetingRow key={`${r.date}-${i}`} row={r} linked={linked} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function MeetingRow({ row, linked }: { row: HubRow; linked: Set<string> }) {
  const { hue } = customerHue(row.bucket);
  const internal = isInternalBucket(row.bucket);
  const kicker = internal ? "Internal" : row.bucket;
  const isLinked = !internal && linked.has(normName(row.bucket));
  const body = (
    <div className="group card relative flex items-center gap-4 p-3.5 transition-all hover:translate-x-[3px] hover:bg-surface2" style={{ borderLeft: `3px solid ${hue}` }}>
      <div className="w-14 shrink-0 text-center">
        <div className="text-sm font-bold leading-tight" style={{ color: hue }}>{monthDay(row.date)}</div>
        <div className="text-2xs text-muted">{year(row.date)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="eyebrow flex items-center gap-1 text-[10px]" style={{ color: hue }}>
          {kicker}
          {isLinked && (
            <span title={`Linked to ${row.bucket}`} className="text-success" style={{ color: "var(--ok)" }}>✓</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-fg">{row.title}</div>
      </div>
      <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
        Open →
      </span>
    </div>
  );
  return row.notePath ? (
    <Link href={`/meetings?note=${encodeURIComponent(row.notePath)}`}>{body}</Link>
  ) : (
    body
  );
}

// ---- grouping helpers ----

function distinctBuckets(rows: HubRow[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.bucket, (counts.get(r.bucket) ?? 0) + 1);
  return Array.from(counts.keys())
    .filter((b) => !isInternalBucket(b))
    .sort((a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b));
}

function monthsOf(rows: HubRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.date.slice(0, 7)))).sort((a, b) => (a < b ? 1 : -1));
}

interface Group {
  key: string;
  label: string | null;
  rows: HubRow[];
  hue?: string;
  last?: string;
}

function groupRows(rows: HubRow[], view: View, tile: string): Group[] {
  const byDate = (a: HubRow, b: HubRow) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  if (view === "all") {
    const s = [...rows].sort(byDate);
    return s.length ? [{ key: "all", label: null, rows: s }] : [];
  }
  const map = new Map<string, HubRow[]>();
  for (const r of rows) {
    const key = view === "customers" ? r.bucket : r.date.slice(0, 7);
    (map.get(key) ?? map.set(key, []).get(key)!).push(r);
  }
  const groups: Group[] = Array.from(map.entries()).map(([key, rs]) => {
    const sorted = rs.sort(byDate);
    const last = sorted.reduce((m, r) => (r.date > m ? r.date : m), "");
    return {
      key,
      label: view === "customers" ? key : monthLabel(`${key}-01`),
      rows: sorted,
      hue: view === "customers" ? customerHue(key).hue : "var(--accent)",
      last,
    };
  });
  if (view === "month") groups.sort((a, b) => (a.key < b.key ? 1 : -1));
  else
    groups.sort((a, b) => {
      const ai = isInternalBucket(a.key) ? 1 : 0;
      const bi = isInternalBucket(b.key) ? 1 : 0;
      return ai - bi || b.rows.length - a.rows.length || a.key.localeCompare(b.key);
    });
  // When a single tile is active we still show its one section (no header noise).
  return tile === "all" ? groups : groups.map((g) => ({ ...g }));
}
