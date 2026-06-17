"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { customerHue, initials, isInternalBucket } from "@/lib/customerHues";

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

type View = "customers" | "series" | "month" | "all";
const VIEWS: { key: View; label: string }[] = [
  { key: "customers", label: "Customers" },
  { key: "series", label: "Series" },
  { key: "month", label: "Month" },
  { key: "all", label: "All" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthDay = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""} ${Number(d.slice(8, 10))}`;
const year = (d: string) => d.slice(0, 4);
const monthLabel = (ym: string) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;

export default function MeetingsHub({
  rows,
  series = [],
}: {
  rows: HubRow[];
  series?: HubSeries[];
}) {
  const [view, setView] = useState<View>("customers");
  const [query, setQuery] = useState("");
  const [tile, setTile] = useState<string>("all"); // active tile key

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
      <Feed view={view} rows={filtered} series={series} tile={tile} />
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
          <Link
            key={s.path}
            href={`/meetings?series=${encodeURIComponent(s.path)}`}
            className="card lift w-[238px] shrink-0 p-4"
          >
            <Avatar label={initials(s.name)} hue="var(--accent)" soft="var(--accent-soft)" />
            <div className="mt-3 truncate text-sm font-semibold text-fg">{s.name}</div>
            <div className="mt-0.5 text-xs text-muted">
              {s.sessions} session{s.sessions === 1 ? "" : "s"}
              {s.latest ? ` · latest ${monthDay(s.latest)}` : ""}
            </div>
          </Link>
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
}: {
  view: View;
  rows: HubRow[];
  series: HubSeries[];
  tile: string;
}) {
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
  const groupingLabel = view === "all" ? "newest first" : `grouped by ${view}`;

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
                <MeetingRow key={`${r.date}-${i}`} row={r} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function MeetingRow({ row }: { row: HubRow }) {
  const { hue } = customerHue(row.bucket);
  const internal = isInternalBucket(row.bucket);
  const kicker = internal ? "Internal" : row.bucket;
  const body = (
    <div className="group card relative flex items-center gap-4 p-3.5 transition-all hover:translate-x-[3px] hover:bg-surface2" style={{ borderLeft: `3px solid ${hue}` }}>
      <div className="w-14 shrink-0 text-center">
        <div className="text-sm font-bold leading-tight" style={{ color: hue }}>{monthDay(row.date)}</div>
        <div className="text-2xs text-muted">{year(row.date)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="eyebrow text-[10px]" style={{ color: hue }}>{kicker}</div>
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
