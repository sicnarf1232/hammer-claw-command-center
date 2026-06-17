"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface HubRow {
  date: string; // YYYY-MM-DD
  bucket: string;
  title: string;
  notePath: string | null;
}

type View = "date" | "month" | "customer";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthLabel(date: string): string {
  const [y, m] = date.split("-");
  const mi = Number(m) - 1;
  return `${MONTHS[mi] ?? m} ${y}`;
}

// Meetings hub: one list, three groupings (newest-first, by month, by customer),
// with search and a freshness line. Works entirely off the index rows.
export default function MeetingsHub({ rows }: { rows: HubRow[] }) {
  const [view, setView] = useState<View>("date");
  const [query, setQuery] = useState("");

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

  const groups = useMemo(() => groupRows(filtered, view), [filtered, view]);
  const newest = rows.reduce((m, r) => (r.date > m ? r.date : m), "");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface2 p-0.5">
          {(["date", "month", "customer"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                view === v
                  ? "bg-surface text-fg shadow-subtle"
                  : "text-muted hover:text-fg"
              }`}
            >
              {v === "date" ? "By date" : v === "month" ? "By month" : "By customer"}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search meetings…"
          className="input w-56 max-w-full"
        />
      </div>

      <div className="mb-3 text-xs text-muted">
        {filtered.length} of {rows.length} meetings
        {newest && (
          <>
            {" · "}
            newest <span className="font-mono tabular-nums">{newest}</span>
          </>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card max-w-2xl p-6 text-center text-sm text-muted">
          No meetings match “{query}”.
        </div>
      ) : (
        <div className="grid max-w-3xl gap-5">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-fg">{g.label}</h3>
                <span className="text-xs text-muted">{g.rows.length}</span>
              </div>
              <div className="grid gap-2">
                {g.rows.map((r, i) => (
                  <Row key={`${r.date}-${i}`} row={r} showDate={view !== "date"} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ row, showDate }: { row: HubRow; showDate: boolean }) {
  return (
    <div className="card flex items-center justify-between gap-3 p-3 transition-shadow hover:shadow-elevated">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-fg">{row.title}</div>
        <div className="mt-0.5 text-xs text-muted">
          <span className="font-mono tabular-nums">{row.date}</span> ·{" "}
          <span className={isInternal(row.bucket) ? "" : "text-merit"}>
            {isInternal(row.bucket) ? "Internal" : `Customer · ${row.bucket}`}
          </span>
          {!row.notePath && " · note not found"}
        </div>
      </div>
      {row.notePath ? (
        <Link
          href={`/meetings?note=${encodeURIComponent(row.notePath)}`}
          className="btn btn-outline shrink-0 cursor-pointer"
        >
          Open
        </Link>
      ) : (
        <span className="shrink-0 text-xs text-muted">missing</span>
      )}
    </div>
  );
}

function isInternal(bucket: string): boolean {
  return /^(internal|unfiled|personal)$/i.test(bucket.trim());
}

interface Group {
  key: string;
  label: string;
  rows: HubRow[];
}

function groupRows(rows: HubRow[], view: View): Group[] {
  if (view === "date") {
    const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1));
    return sorted.length ? [{ key: "all", label: "All meetings", rows: sorted }] : [];
  }

  const map = new Map<string, HubRow[]>();
  for (const r of rows) {
    const key = view === "month" ? r.date.slice(0, 7) : r.bucket || "Unfiled";
    (map.get(key) ?? map.set(key, []).get(key)!).push(r);
  }

  const groups: Group[] = Array.from(map.entries()).map(([key, rs]) => ({
    key,
    label: view === "month" ? monthLabel(`${key}-01`) : key,
    rows: rs.sort((a, b) => (a.date < b.date ? 1 : -1)),
  }));

  if (view === "month") {
    groups.sort((a, b) => (a.key < b.key ? 1 : -1)); // newest month first
  } else {
    // Customers by activity (most meetings first), Internal-like groups last.
    groups.sort((a, b) => {
      const ai = isInternal(a.key) ? 1 : 0;
      const bi = isInternal(b.key) ? 1 : 0;
      if (ai !== bi) return ai - bi;
      return b.rows.length - a.rows.length || a.label.localeCompare(b.label);
    });
  }
  return groups;
}
