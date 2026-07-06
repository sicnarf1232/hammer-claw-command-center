"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TaskView } from "@/lib/taskView";
import { customerHue, initials } from "@/lib/customerHues";
import { SearchIcon, ChevronDownIcon } from "./icons";

// Grouped-by-account task view (the enhanced Tasks default). Each account group
// shows an urgency-bordered card per task; the header carries the overdue count.

function cleanTitle(s: string): string {
  return s.replace(/\[[A-Za-z][\w-]*::[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

function daysUntil(due: string | undefined, today: string): number | null {
  if (!due) return null;
  const a = new Date(due + "T12:00:00").getTime();
  const b = new Date(today + "T12:00:00").getTime();
  return Math.round((a - b) / 86400000);
}

// Urgency: <0 red, 0-2 amber, 3-7 sea glass, >7 gray/none.
function urgency(due: string | undefined, today: string): { color: string | null; label: string } {
  const d = daysUntil(due, today);
  if (d == null) return { color: null, label: "" };
  if (d < 0) return { color: "var(--due)", label: `${-d}d overdue` };
  if (d <= 2) return { color: "var(--warm)", label: d === 0 ? "Due today" : `${d}d left` };
  if (d <= 7) return { color: "var(--accent)", label: `${d}d left` };
  return { color: null, label: due ?? "" };
}

interface Group {
  key: string;
  name: string;
  slug?: string;
  tasks: TaskView[];
  overdue: number;
}

export default function TasksGrouped({ tasks, today }: { tasks: TaskView[]; today: string }) {
  const [rows, setRows] = useState(tasks);
  const [q, setQ] = useState("");
  const [ws, setWs] = useState("merit");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const workstreams = useMemo(
    () => Array.from(new Set(rows.map((r) => r.workstream).filter(Boolean))).sort() as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((t) => {
      if (ws !== "all" && t.workstream !== ws) return false;
      if (!needle) return true;
      return (
        cleanTitle(t.title).toLowerCase().includes(needle) ||
        (t.customer ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, ws]);

  const groups = useMemo(() => groupByAccount(filtered, today), [filtered, today]);
  const urgentCount = useMemo(
    () => filtered.filter((t) => {
      const d = daysUntil(t.due, today);
      return d != null && d <= 5;
    }).length,
    [filtered, today],
  );

  async function complete(t: TaskView) {
    setRows((prev) => prev.filter((x) => x.id !== t.id));
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFile: t.sourceFile, sourceLine: t.sourceLine, done: true }),
      });
      if (!res.ok) setRows((prev) => [t, ...prev]);
    } catch {
      setRows((prev) => [t, ...prev]);
    }
  }

  return (
    <div>
      {urgentCount > 0 ? (
        <div
          className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium"
          style={{ borderColor: "var(--warm)", background: "var(--warm-soft)", color: "var(--warm)" }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--warm)" }} />
          {urgentCount} task{urgentCount === 1 ? "" : "s"} due within 5 days or overdue. Knock them out or send an update.
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="input w-56 pl-8" />
        </div>
        <select aria-label="Workstream" value={ws} onChange={(e) => setWs(e.target.value)} className="input py-1.5 text-sm">
          <option value="all">All workstreams</option>
          {workstreams.map((w) => (
            <option key={w} value={w}>
              {w[0].toUpperCase() + w.slice(1)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted tabular-nums">{filtered.length} tasks</span>
      </div>

      {groups.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">No tasks match these filters.</div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const open = !collapsed[g.key];
            const hue = customerHue(g.name);
            return (
              <section key={g.key} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [g.key]: open }))}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface2"
                >
                  <ChevronDownIcon className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white"
                    style={{ background: g.slug ? hue.hue : "var(--line-2)" }}
                  >
                    {g.slug ? initials(g.name) : "—"}
                  </span>
                  <span className="text-sm font-bold" style={{ color: g.slug ? hue.hue : "var(--ink-2)" }}>
                    {g.name}
                  </span>
                  <span className="chip border-border bg-surface2 text-muted">{g.tasks.length}</span>
                  {g.overdue > 0 ? <span className="chip border-due/30 bg-due/10 text-due">{g.overdue} overdue</span> : null}
                </button>

                {open ? (
                  <div className="space-y-1.5 px-2.5 pb-2.5">
                    {g.tasks.map((t) => (
                      <TaskCard key={t.id} t={t} today={today} onComplete={() => complete(t)} showAccount={!g.slug} />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  t,
  today,
  onComplete,
  showAccount,
}: {
  t: TaskView;
  today: string;
  onComplete: () => void;
  showAccount: boolean;
}) {
  const u = urgency(t.due, today);
  const quoteParams = new URLSearchParams();
  if (t.customer && t.customer !== "internal") quoteParams.set("customer", t.customer);

  return (
    <div
      className="rounded-xl border border-border bg-surface px-3 py-2"
      style={u.color ? { borderLeft: `3px solid ${u.color}` } : undefined}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={onComplete}
          aria-label="Mark done"
          title="Mark done"
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-transparent transition-colors hover:border-success hover:text-success"
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-fg">{cleanTitle(t.title)}</span>
            {u.label ? (
              <span className="shrink-0 text-2xs font-semibold" style={{ color: u.color ?? "var(--muted)" }}>
                {u.label}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-muted">
            {showAccount && t.customer && t.customer !== "internal" ? (
              <span className="font-medium text-fg/70">{t.customer}</span>
            ) : null}
            {t.type ? <span>{t.type}</span> : null}
            {t.taskStatus ? <span className="capitalize">{t.taskStatus}</span> : null}
          </div>
          {t.description ? <p className="mt-1 line-clamp-2 text-xs text-muted">{t.description}</p> : null}
        </div>
      </div>
    </div>
  );
}

function groupByAccount(tasks: TaskView[], today: string): Group[] {
  const map = new Map<string, Group>();
  const NO = "~none";
  for (const t of tasks) {
    const isAcct = !!t.customer && t.customer !== "internal";
    const key = isAcct ? t.customer! : NO;
    let g = map.get(key);
    if (!g) {
      g = { key, name: isAcct ? t.customer! : "No account", slug: isAcct ? t.accountSlug : undefined, tasks: [], overdue: 0 };
      map.set(key, g);
    }
    g.tasks.push(t);
    if (t.due && t.due < today) g.overdue++;
  }
  const sortTasks = (a: TaskView, b: TaskView) => (a.due ?? "9999") < (b.due ?? "9999") ? -1 : 1;
  const groups = Array.from(map.values());
  groups.forEach((g) => g.tasks.sort(sortTasks));
  // Overdue-heavy accounts first; "No account" always last.
  groups.sort((a, b) => {
    if (a.key === NO) return 1;
    if (b.key === NO) return -1;
    return b.overdue - a.overdue || b.tasks.length - a.tasks.length || a.name.localeCompare(b.name);
  });
  return groups;
}
