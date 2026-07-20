"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TaskView } from "@/lib/taskView";
import { TASK_TYPES, matchedTaskTypeKeyword, type TaskType } from "@/lib/taskType";
import {
  TASK_STATUSES,
  applyTaskFieldUpdate,
  type TaskUpdateField,
} from "@/lib/taskUpdate";
import { formatDateShort } from "@/lib/dates";
import { SearchIcon } from "./icons";
import { TaskLinkedEmails } from "./TaskEmailLink";

// Phase: the Tasks page as a sortable, filterable table. Rows are tasks; the
// columns are Task / Account / Type / Status / Start / Due. Default scope is
// Merit OEM (others behind the workstream filter). Replaces the old grouped list.

type SortKey = "title" | "account" | "type" | "status" | "start" | "due";
type SortDir = "asc" | "desc";

const TYPE_HUE: Record<TaskType, string> = {
  PCN: "#5145E6",
  "Quality & Reg": "#0E9F8E",
  "Pricing/Quote": "#D98A0B",
  "Samples/Dev": "#B852CC",
  "Supply/Logistics": "#2E7DD1",
  Commercial: "#C2456E",
  "Admin/Other": "#6B7280",
};

function cleanTitle(s: string): string {
  return s.replace(/\[[A-Za-z][\w-]*::[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

function statusLabel(t: TaskView): string {
  const s = (t.taskStatus ?? "").toLowerCase();
  if (s === "waiting") return "Waiting";
  if (s === "blocked") return "Blocked";
  if (s === "someday") return "Someday";
  return "Open";
}

export default function TasksTable({
  tasks,
  today,
  accounts: allAccounts = [],
  canEdit = false,
}: {
  tasks: TaskView[];
  today: string;
  accounts?: string[];
  canEdit?: boolean;
}) {
  const [rows, setRows] = useState(tasks);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [ws, setWs] = useState("merit");
  const [account, setAccount] = useState("all");
  const [type, setType] = useState<"all" | TaskType>("all");
  const [status, setStatus] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const workstreams = useMemo(
    () => Array.from(new Set(rows.map((r) => r.workstream).filter(Boolean))).sort() as string[],
    [rows],
  );
  const accounts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.customer).filter((c): c is string => !!c && c !== "internal"))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((t) => {
      if (ws !== "all" && t.workstream !== ws) return false;
      if (account !== "all" && t.customer !== account) return false;
      if (type !== "all" && t.type !== type) return false;
      if (status !== "all" && statusLabel(t).toLowerCase() !== status) return false;
      if (!needle) return true;
      return (
        cleanTitle(t.title).toLowerCase().includes(needle) ||
        (t.customer ?? "").toLowerCase().includes(needle) ||
        t.type.toLowerCase().includes(needle)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (t: TaskView): string => {
      switch (sortKey) {
        case "title": return cleanTitle(t.title).toLowerCase();
        case "account": return (t.customer ?? "~").toLowerCase();
        case "type": return t.type;
        case "status": return statusLabel(t);
        case "start": return t.start ?? "9999";
        case "due": return t.due ?? "9999";
      }
    };
    return [...out].sort((a, b) => val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0);
  }, [rows, q, ws, account, type, status, sortKey, sortDir]);

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function complete(t: TaskView) {
    setRows((prev) => prev.filter((x) => x.id !== t.id)); // optimistic
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFile: t.sourceFile, sourceLine: t.sourceLine, done: true }),
      });
      if (!res.ok) setRows((prev) => [t, ...prev]); // revert
    } catch {
      setRows((prev) => [t, ...prev]);
    }
  }

  // Inline edit (dev-feedback #8): update one field on a task row directly in
  // the DB. Optimistic with rollback on failure, mirroring complete() above.
  async function updateField(t: TaskView, field: TaskUpdateField, value: string) {
    const errKey = `${t.id}:${field}`;
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[errKey];
      return next;
    });
    setRows((prev) => prev.map((r) => (r.id === t.id ? applyTaskFieldUpdate(r, field, value || null) : r)));
    try {
      const res = await fetch("/api/tasks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFile: t.sourceFile, sourceLine: t.sourceLine, field, value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRows((prev) => prev.map((r) => (r.id === t.id ? t : r))); // revert
        setFieldErrors((prev) => ({ ...prev, [errKey]: data.error ?? "Could not update the task." }));
      }
    } catch {
      setRows((prev) => prev.map((r) => (r.id === t.id ? t : r)));
      setFieldErrors((prev) => ({ ...prev, [errKey]: "Network error." }));
    }
  }

  return (
    <div>
      {/* filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks…"
            className="input w-56 pl-8"
          />
        </div>
        <Select value={ws} onChange={setWs} label="Workstream">
          <option value="all">All workstreams</option>
          {workstreams.map((w) => (
            <option key={w} value={w}>
              {w[0].toUpperCase() + w.slice(1)}
            </option>
          ))}
        </Select>
        <Select value={account} onChange={setAccount} label="Account">
          <option value="all">All accounts</option>
          {accounts.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
        <Select value={type} onChange={(v) => setType(v as typeof type)} label="Type">
          <option value="all">All types</option>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Select value={status} onChange={setStatus} label="Status">
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="waiting">Waiting</option>
          <option value="blocked">Blocked</option>
          <option value="someday">Someday</option>
        </Select>
        <span className="ml-auto text-sm text-muted tabular-nums">{filtered.length} tasks</span>
      </div>

      {/* table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--line)" }}>
              <Th />
              <Th onClick={() => sortBy("title")} active={sortKey === "title"} dir={sortDir}>Task</Th>
              <Th onClick={() => sortBy("account")} active={sortKey === "account"} dir={sortDir}>Account</Th>
              <Th onClick={() => sortBy("type")} active={sortKey === "type"} dir={sortDir}>Type</Th>
              <Th onClick={() => sortBy("status")} active={sortKey === "status"} dir={sortDir}>Status</Th>
              <Th onClick={() => sortBy("start")} active={sortKey === "start"} dir={sortDir}>Start</Th>
              <Th onClick={() => sortBy("due")} active={sortKey === "due"} dir={sortDir}>Due</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted">
                  No tasks match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <Row
                  key={t.id}
                  t={t}
                  today={today}
                  expanded={expanded === t.id}
                  onToggle={() => setExpanded((id) => (id === t.id ? null : t.id))}
                  onComplete={() => complete(t)}
                  canEdit={canEdit}
                  accounts={allAccounts}
                  onFieldUpdate={(field, value) => updateField(t, field, value)}
                  fieldErrors={fieldErrors}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  t,
  today,
  expanded,
  onToggle,
  onComplete,
  canEdit,
  accounts,
  onFieldUpdate,
  fieldErrors,
}: {
  t: TaskView;
  today: string;
  expanded: boolean;
  onToggle: () => void;
  onComplete: () => void;
  canEdit: boolean;
  accounts: string[];
  onFieldUpdate: (field: TaskUpdateField, value: string) => void;
  fieldErrors: Record<string, string>;
}) {
  const overdue = !!t.due && t.due < today;
  const dueToday = t.due === today;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const accountErr = fieldErrors[`${t.id}:account`];
  const typeErr = fieldErrors[`${t.id}:type`];
  const statusErr = fieldErrors[`${t.id}:status`];
  const dueErr = fieldErrors[`${t.id}:due`];
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b align-top transition-colors hover:bg-surface2"
        style={{ borderColor: "var(--line)" }}
      >
        <td className="py-2.5 pl-3 pr-1">
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              onComplete();
            }}
            aria-label="Complete task"
            className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-fg/35 text-transparent transition-colors hover:border-success hover:text-success"
            title="Mark done"
          >
            ✓
          </button>
        </td>
        <td className="max-w-[420px] py-2.5 pr-3">
          <div className="flex items-center gap-1.5 text-fg">
            <span
              className="text-ink3 transition-transform"
              style={{ transform: expanded ? "rotate(90deg)" : "none" }}
            >
              ›
            </span>
            <span>{cleanTitle(t.title)}</span>
          </div>
          {!expanded && t.description && (
            <div className="mt-0.5 truncate pl-4 text-2xs text-muted">{t.description}</div>
          )}
        </td>
        <td className="py-2.5 pr-3" onClick={canEdit ? stop : undefined}>
          {canEdit ? (
            <>
              <select
                aria-label="Account"
                value={t.customer && t.customer !== "internal" ? t.customer : ""}
                onChange={(e) => onFieldUpdate("account", e.target.value)}
                className="input py-1 text-xs"
              >
                <option value="">No account</option>
                {accounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              {accountErr && <p className="mt-0.5 text-2xs text-danger">{accountErr}</p>}
            </>
          ) : t.customer && t.customer !== "internal" ? (
            t.accountSlug ? (
              <Link
                href={`/accounts?a=${t.accountSlug}`}
                onClick={stop}
                className="font-medium hover:underline"
                style={{ color: "var(--accent-2)" }}
              >
                {t.customer}
              </Link>
            ) : (
              <span className="text-fg/80">{t.customer}</span>
            )
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="py-2.5 pr-3" onClick={canEdit ? stop : undefined}>
          {canEdit ? (
            <>
              <select
                aria-label="Type"
                value={t.type}
                onChange={(e) => onFieldUpdate("type", e.target.value)}
                className="input py-1 text-xs"
                style={{ color: TYPE_HUE[t.type] }}
              >
                {TASK_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {ty}
                  </option>
                ))}
              </select>
              {typeErr && <p className="mt-0.5 text-2xs text-danger">{typeErr}</p>}
            </>
          ) : (
            <span
              className="chip whitespace-nowrap"
              style={{ background: `${TYPE_HUE[t.type]}1a`, color: TYPE_HUE[t.type], borderColor: "transparent" }}
            >
              {t.type}
            </span>
          )}
        </td>
        <td className="py-2.5 pr-3 text-fg/80" onClick={canEdit ? stop : undefined}>
          {canEdit ? (
            <>
              <select
                aria-label="Status"
                value={(t.taskStatus ?? "open").toLowerCase()}
                onChange={(e) => onFieldUpdate("status", e.target.value)}
                className="input py-1 text-xs"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
              {statusErr && <p className="mt-0.5 text-2xs text-danger">{statusErr}</p>}
            </>
          ) : (
            statusLabel(t)
          )}
        </td>
        <td className="py-2.5 pr-3 tabular-nums text-muted">{t.start ? formatDateShort(t.start) : "—"}</td>
        <td className="py-2.5 pr-3 tabular-nums" onClick={canEdit ? stop : undefined}>
          {canEdit ? (
            <>
              <input
                type="date"
                aria-label="Due date"
                value={t.due ?? ""}
                onChange={(e) => onFieldUpdate("due", e.target.value)}
                className="input py-1 text-xs"
                style={{ color: overdue ? "var(--due)" : dueToday ? "var(--warm)" : undefined }}
              />
              {dueErr && <p className="mt-0.5 text-2xs text-danger">{dueErr}</p>}
            </>
          ) : t.due ? (
            <span style={{ color: overdue ? "var(--due)" : dueToday ? "var(--warm)" : "var(--ink-2)" }}>
              {formatDateShort(t.due)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
          <td />
          <td colSpan={6} className="py-3 pr-4">
            <TaskDetail t={t} />
          </td>
        </tr>
      )}
    </>
  );
}

function quoteHref(t: TaskView): string {
  const params = new URLSearchParams();
  if (t.customer && t.customer !== "internal") params.set("customer", t.customer);
  params.set("desc", cleanTitle(t.title));
  const parseText = [cleanTitle(t.title), t.description, t.notes]
    .filter(Boolean)
    .join("\n");
  if (parseText) params.set("parse", parseText);
  return `/quote?${params.toString()}`;
}

function TaskDetail({ t }: { t: TaskView }) {
  // Gate "Create quote" on an actual signal (dev-feedback #11 Part B) instead
  // of always showing it: only when the task's own type classification (or
  // Jordan's manual override, both already resolved onto t.type) says this
  // is pricing/quote work. The matched keyword becomes the WHY line.
  const quoteReasonKeyword =
    t.type === "Pricing/Quote" ? matchedTaskTypeKeyword(t.title, t.description) : null;
  return (
    <div className="grid gap-2 text-sm">
      {t.description ? (
        <p className="whitespace-pre-wrap text-fg/90">{t.description}</p>
      ) : (
        <p className="text-muted">No additional detail captured for this task.</p>
      )}
      {t.type === "Pricing/Quote" && (
        <div className="pt-1">
          <Link
            href={quoteHref(t)}
            className="btn-outline inline-flex items-center gap-1.5 text-xs"
            style={{ borderColor: TYPE_HUE["Pricing/Quote"], color: TYPE_HUE["Pricing/Quote"] }}
          >
            Create quote →
          </Link>
          <p className="mt-1 text-2xs text-muted">
            {quoteReasonKeyword
              ? `Suggested because this task mentions "${quoteReasonKeyword.toLowerCase()}".`
              : "Suggested because this task is typed as Pricing/Quote."}
          </p>
        </div>
      )}
      <TaskLinkedEmails sourceFile={t.sourceFile} sourceLine={t.sourceLine} />
      {t.notes && (
        <p className="whitespace-pre-wrap text-xs text-muted">
          <span className="font-semibold text-fg/70">Notes: </span>
          {t.notes}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {t.priority && (
          <span className="chip" style={{ borderColor: "var(--line-2)" }}>priority: {t.priority}</span>
        )}
        {t.workstream && (
          <span className="chip" style={{ borderColor: "var(--line-2)" }}>{t.workstream}</span>
        )}
        {t.thread && (
          <span className="chip" style={{ borderColor: "var(--line-2)" }}>thread: {t.thread}</span>
        )}
        <span className="chip font-mono text-2xs" style={{ borderColor: "var(--line-2)" }}>
          {t.sourceFile.split("/").pop()}
        </span>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: SortDir;
}) {
  return (
    <th
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-2.5 text-2xs font-bold uppercase tracking-wide text-muted ${onClick ? "cursor-pointer select-none hover:text-fg" : ""}`}
    >
      {children}
      {active && <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input py-1.5 text-sm"
    >
      {children}
    </select>
  );
}
