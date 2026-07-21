"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TaskView } from "@/lib/taskView";
import { cleanTaskTitle as cleanTitle } from "@/lib/taskView";
import type { TaskMeta, ChecklistStep } from "@/lib/taskMeta";
import { checklistProgress, formatChecklistProgress } from "@/lib/checklistProgress";
import { TASK_TYPES, TASK_TYPE_HUE as TYPE_HUE, type TaskType } from "@/lib/taskType";
import {
  TASK_STATUSES,
  applyTaskFieldUpdate,
  taskStatusLabel,
  taskStatusColorClass,
  type TaskUpdateField,
} from "@/lib/taskUpdate";
import { formatDateShort } from "@/lib/dates";
import { SearchIcon, ActivityIcon } from "./icons";
import { TaskLinkedEmails, TaskLinkedMeetings, TaskEmailAction } from "./TaskEmailLink";
import TaskUpdateLog from "./TaskUpdateLog";
import TaskFieldEditor from "./TaskFieldEditor";
import DelegatePicker, { type DelegateCandidate } from "./DelegatePicker";
import TaskMetaChips from "./TaskMetaChips";
import TaskSuggestedAction from "./TaskSuggestedAction";

// Phase: the Tasks page as a sortable, filterable table. Rows are tasks; the
// columns are Task / Account / Type / Status / Start / Due. Default scope is
// Merit OEM (others behind the workstream filter). Replaces the old grouped list.
//
// dev-feedback #16 Part B: visual pass on the row/complete interaction and a
// full "task page" treatment for the expanded detail (Part A's update log
// lives there, as the centerpiece).

type SortKey = "title" | "account" | "type" | "status" | "start" | "due";
type SortDir = "asc" | "desc";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function TasksTable({
  tasks,
  today,
  accounts: allAccounts = [],
  canEdit = false,
  meta = {},
}: {
  tasks: TaskView[];
  today: string;
  accounts?: string[];
  canEdit?: boolean;
  // Checklist / sub-items progress (dev-feedback #20 item 3), keyed by
  // TaskView id. Reuses the existing task_meta checklist that TasksGrouped's
  // TaskCard already reads/writes, rather than a second, competing "sub-items"
  // store (see the module comment on TaskDetail's checklist section below).
  meta?: Record<string, TaskMeta>;
}) {
  const [rows, setRows] = useState(tasks);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Completion is a two-beat transition, not an instant filter: the row
  // shows its checkmark + strikethrough first (checkingIds), then fades and
  // collapses out (fadingIds), so finishing a task reads as a small reward
  // instead of the row just vanishing. Pure CSS transitions, no new deps.
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
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
      if (status !== "all" && (t.taskStatus ?? "open").toLowerCase() !== status) return false;
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
        case "status": return taskStatusLabel(t.taskStatus, t.delegatedTo?.name);
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
    setCheckingIds((prev) => new Set(prev).add(t.id));
    const req = fetch("/api/tasks/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceFile: t.sourceFile, sourceLine: t.sourceLine, done: true }),
    }).catch(() => null);

    await sleep(200); // let the checkmark + strikethrough register first
    setFadingIds((prev) => new Set(prev).add(t.id));
    await sleep(300); // then fade/collapse before it actually leaves the list

    setRows((prev) => prev.filter((x) => x.id !== t.id));
    if (expanded === t.id) setExpanded(null);
    setCheckingIds((prev) => {
      const next = new Set(prev);
      next.delete(t.id);
      return next;
    });
    setFadingIds((prev) => {
      const next = new Set(prev);
      next.delete(t.id);
      return next;
    });

    const res = await req;
    if (!res || !res.ok) setRows((prev) => [t, ...prev]); // revert
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

  // Delegate edit (dev-feedback #20 item 1): a dedicated path rather than
  // routing through updateField above, because the picker already hands back
  // the full { id, name, email } shape (not just a wire-format string), so
  // the optimistic row update needs no round trip to resolve a display name.
  // The network write still reuses the generic /api/tasks/update route with
  // field: "delegate" (validated server-side against real people). Returns
  // whether the write succeeded, so the row can offer the one-click "mark as
  // waiting" nudge only after a real save.
  async function updateDelegate(t: TaskView, person: DelegateCandidate | null): Promise<boolean> {
    const errKey = `${t.id}:delegate`;
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[errKey];
      return next;
    });
    const prevRow = t;
    setRows((prev) =>
      prev.map((r) =>
        r.id === t.id
          ? {
              ...r,
              delegatedTo: person ? { personId: person.id, name: person.name, email: person.email } : undefined,
            }
          : r,
      ),
    );
    try {
      const res = await fetch("/api/tasks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFile: t.sourceFile,
          sourceLine: t.sourceLine,
          field: "delegate",
          value: person ? String(person.id) : "",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRows((prev) => prev.map((r) => (r.id === t.id ? prevRow : r)));
        setFieldErrors((prev) => ({ ...prev, [errKey]: data.error ?? "Could not update the task." }));
        return false;
      }
      return true;
    } catch {
      setRows((prev) => prev.map((r) => (r.id === t.id ? prevRow : r)));
      setFieldErrors((prev) => ({ ...prev, [errKey]: "Network error." }));
      return false;
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
              <th className="whitespace-nowrap px-3 py-2.5 text-2xs font-bold uppercase tracking-wide text-muted">
                Delegate
              </th>
              <Th onClick={() => sortBy("start")} active={sortKey === "start"} dir={sortDir}>Start</Th>
              <Th onClick={() => sortBy("due")} active={sortKey === "due"} dir={sortDir}>Due</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted">
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
                  checking={checkingIds.has(t.id)}
                  fading={fadingIds.has(t.id)}
                  canEdit={canEdit}
                  accounts={allAccounts}
                  onFieldUpdate={(field, value) => updateField(t, field, value)}
                  onDelegateSave={(person) => updateDelegate(t, person)}
                  fieldErrors={fieldErrors}
                  meta={meta[t.id]}
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
  checking,
  fading,
  canEdit,
  accounts,
  onFieldUpdate,
  onDelegateSave,
  fieldErrors,
  meta,
}: {
  t: TaskView;
  today: string;
  expanded: boolean;
  onToggle: () => void;
  onComplete: () => void;
  checking: boolean;
  fading: boolean;
  canEdit: boolean;
  accounts: string[];
  onFieldUpdate: (field: TaskUpdateField, value: string) => void;
  onDelegateSave: (person: DelegateCandidate | null) => Promise<boolean>;
  fieldErrors: Record<string, string>;
  meta?: TaskMeta;
}) {
  const overdue = !!t.due && t.due < today;
  const dueToday = t.due === today;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const accountErr = fieldErrors[`${t.id}:account`];
  const typeErr = fieldErrors[`${t.id}:type`];
  const statusErr = fieldErrors[`${t.id}:status`];
  const dueErr = fieldErrors[`${t.id}:due`];
  const delegateErr = fieldErrors[`${t.id}:delegate`];
  const settling = checking || fading;

  // Sub-items checklist (dev-feedback #20 item 3), lifted up to Row (not just
  // inside TaskDetail) so the "N of M" badge on the always-visible collapsed
  // row reflects live edits even after the detail panel collapses, mirroring
  // TasksGrouped's TaskCard (which never unmounts its own checklist state).
  const [checklist, setChecklist] = useState<ChecklistStep[]>(meta?.checklist ?? []);
  const checklistProgressLabel = formatChecklistProgress(checklist);

  async function persistChecklist(next: ChecklistStep[]) {
    setChecklist(next);
    await fetch("/api/tasks/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: t.id, checklist: next }),
    }).catch(() => {});
  }

  // One-click "mark as waiting" nudge (dev-feedback #20 item 2), shown right
  // after a delegate save when the task had no real status yet. Per this
  // app's standing rule that state changes are proposed, not silently
  // applied: this never sets status itself, it only offers a one-tap
  // confirm that Jordan has to click.
  const [waitingPrompt, setWaitingPrompt] = useState<string | null>(null);

  async function handleDelegateSave(person: DelegateCandidate | null) {
    const wasOpenish = !t.taskStatus || t.taskStatus.toLowerCase() === "open";
    const ok = await onDelegateSave(person);
    if (ok && person && wasOpenish) setWaitingPrompt(person.name);
    else setWaitingPrompt(null);
  }

  function confirmWaiting() {
    onFieldUpdate("status", "waiting");
    setWaitingPrompt(null);
  }

  return (
    <>
      <tr
        onClick={settling ? undefined : onToggle}
        className={`${settling ? "" : "cursor-pointer"} border-b align-top transition-[opacity,transform] duration-300 ease-out hover:bg-surface2 ${fading ? "-translate-y-1 opacity-0" : "opacity-100"}`}
        style={{ borderColor: "var(--line)" }}
      >
        <td className="py-3 pl-3 pr-1">
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              if (!settling) onComplete();
            }}
            aria-label="Complete task"
            disabled={settling}
            className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 text-[10px] transition-colors duration-200 ${
              checking
                ? "border-success bg-success text-white"
                : "border-fg/35 text-transparent hover:border-success hover:text-success"
            }`}
            title="Mark done"
          >
            ✓
          </button>
        </td>
        <td className="max-w-[420px] py-3 pr-3">
          <div className="flex items-center gap-1.5 text-fg">
            <span
              className="text-muted transition-transform"
              style={{ transform: expanded ? "rotate(90deg)" : "none" }}
            >
              ›
            </span>
            <span className={`transition-colors duration-200 ${checking ? "text-muted line-through" : ""}`}>
              {cleanTitle(t.title)}
            </span>
            {checklistProgressLabel ? (
              <span
                className="chip shrink-0 whitespace-nowrap border-border bg-surface2 text-2xs text-muted"
                title="Sub-items done"
              >
                {checklistProgressLabel}
              </span>
            ) : null}
          </div>
          {!expanded && t.description && (
            <div className="mt-0.5 truncate pl-4 text-2xs text-muted">{t.description}</div>
          )}
        </td>
        <td className="py-3 pr-3" onClick={canEdit ? stop : undefined}>
          {canEdit ? (
            <TaskFieldEditor
              chip={
                t.customer && t.customer !== "internal" ? (
                  <span className="chip whitespace-nowrap border-border bg-surface2 text-fg/80">
                    {t.customer}
                  </span>
                ) : null
              }
              emptyLabel="Add account"
              initialValue={t.customer && t.customer !== "internal" ? t.customer : ""}
              onSave={(value) => onFieldUpdate("account", value)}
              error={accountErr}
              renderControl={(value, setValue) => (
                <select
                  aria-label="Account"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="input py-1 text-xs"
                  autoFocus
                >
                  <option value="">No account</option>
                  {accounts.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              )}
            />
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
        <td className="py-3 pr-3" onClick={canEdit ? stop : undefined}>
          {canEdit ? (
            <TaskFieldEditor
              chip={
                <span
                  className="chip whitespace-nowrap"
                  style={{ background: `${TYPE_HUE[t.type]}1a`, color: TYPE_HUE[t.type], borderColor: "transparent" }}
                >
                  {t.type}
                </span>
              }
              emptyLabel="Add type"
              initialValue={t.type}
              onSave={(value) => onFieldUpdate("type", value)}
              error={typeErr}
              renderControl={(value, setValue) => (
                <select
                  aria-label="Type"
                  value={value}
                  onChange={(e) => setValue(e.target.value as TaskType)}
                  className="input py-1 text-xs"
                  style={{ color: TYPE_HUE[value] }}
                  autoFocus
                >
                  {TASK_TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {ty}
                    </option>
                  ))}
                </select>
              )}
            />
          ) : (
            <span
              className="chip whitespace-nowrap"
              style={{ background: `${TYPE_HUE[t.type]}1a`, color: TYPE_HUE[t.type], borderColor: "transparent" }}
            >
              {t.type}
            </span>
          )}
        </td>
        <td className="py-3 pr-3" onClick={canEdit ? stop : undefined}>
          {canEdit ? (
            <TaskFieldEditor
              chip={
                <span className={`chip whitespace-nowrap ${taskStatusColorClass(t.taskStatus)}`}>
                  {taskStatusLabel(t.taskStatus, t.delegatedTo?.name)}
                </span>
              }
              emptyLabel="Add status"
              initialValue={(t.taskStatus ?? "open").toLowerCase()}
              onSave={(value) => onFieldUpdate("status", value)}
              error={statusErr}
              renderControl={(value, setValue) => (
                <select
                  aria-label="Status"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="input py-1 text-xs"
                  autoFocus
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              )}
            />
          ) : (
            <span className={`chip whitespace-nowrap ${taskStatusColorClass(t.taskStatus)}`}>
              {taskStatusLabel(t.taskStatus, t.delegatedTo?.name)}
            </span>
          )}
        </td>
        <td className="py-3 pr-3" onClick={canEdit ? stop : undefined}>
          {canEdit ? (
            <TaskFieldEditor<DelegateCandidate | null>
              chip={
                t.delegatedTo ? (
                  <span className="chip whitespace-nowrap border-accent2/30 bg-accentSoft text-accent2">
                    {t.delegatedTo.name}
                  </span>
                ) : null
              }
              emptyLabel="Add delegate"
              initialValue={
                t.delegatedTo
                  ? { id: t.delegatedTo.personId, name: t.delegatedTo.name, email: t.delegatedTo.email ?? null }
                  : null
              }
              onSave={handleDelegateSave}
              error={delegateErr}
              renderControl={(value, setValue) => <DelegatePicker value={value} onChange={setValue} />}
            />
          ) : t.delegatedTo ? (
            <span className="chip whitespace-nowrap border-accent2/30 bg-accentSoft text-accent2">
              {t.delegatedTo.name}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
          {waitingPrompt ? (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-2xs text-muted">
              <span>Mark as waiting on {waitingPrompt}?</span>
              <button
                type="button"
                onClick={confirmWaiting}
                className="rounded-md border border-info/40 px-1.5 py-0.5 font-semibold text-info hover:bg-info/10"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setWaitingPrompt(null)}
                className="text-muted hover:text-fg"
              >
                Not now
              </button>
            </div>
          ) : null}
        </td>
        <td className="py-3 pr-3 tabular-nums text-muted">{t.start ? formatDateShort(t.start) : "—"}</td>
        <td className="py-3 pr-3 tabular-nums" onClick={canEdit ? stop : undefined}>
          {canEdit ? (
            <TaskFieldEditor
              chip={
                t.due ? (
                  <span
                    className="chip whitespace-nowrap"
                    style={{ color: overdue ? "var(--due)" : dueToday ? "var(--warm)" : "var(--ink-2)" }}
                  >
                    {formatDateShort(t.due)}
                  </span>
                ) : null
              }
              emptyLabel="Add due date"
              initialValue={t.due ?? ""}
              onSave={(value) => onFieldUpdate("due", value)}
              error={dueErr}
              renderControl={(value, setValue) => (
                <input
                  type="date"
                  aria-label="Due date"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="input py-1 text-xs"
                  autoFocus
                />
              )}
            />
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
          <td colSpan={7} className="px-3 py-4">
            <TaskDetail t={t} checklist={checklist} onChecklistChange={persistChecklist} />
          </td>
        </tr>
      )}
    </>
  );
}

// The expanded row: a proper "task page," not a cramped popover
// (dev-feedback #16 Part B). A left accent bar in the task's own type color
// carries the type identity through from the collapsed chip; two columns
// separate "what this is" from "what's happening on it," with the update
// log (Part A) as the visual centerpiece of the right column.
function TaskDetail({
  t,
  checklist,
  onChecklistChange,
}: {
  t: TaskView;
  checklist: ChecklistStep[];
  onChecklistChange: (next: ChecklistStep[]) => void;
}) {
  const [refreshToken, setRefreshToken] = useState(0);
  const bumpRefresh = () => setRefreshToken((x) => x + 1);
  const hue = TYPE_HUE[t.type];

  return (
    <div
      className="overflow-hidden rounded-2xl border bg-surface animate-fade-in"
      style={{ borderColor: "var(--line)", borderLeft: `3px solid ${hue}` }}
    >
      <div className="grid gap-6 p-4 sm:p-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Left: what this task is */}
        <div className="min-w-0">
          <div className="eyebrow text-muted">Description</div>
          {t.description ? (
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-fg/90">{t.description}</p>
          ) : (
            <p className="mt-1.5 text-sm text-muted">No additional detail captured for this task.</p>
          )}
          {t.notes && (
            <p className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-muted">
              <span className="font-semibold text-fg/70">Notes: </span>
              {t.notes}
            </p>
          )}

          {/* dev-feedback #21: a real judgment call about what Jordan needs
              to do next (draft an email to a named person, or build a
              quote), not a fixed gate on the task's type classification.
              Renders nothing when there is no clear single action. */}
          <TaskSuggestedAction t={t} />

          <div className="mt-4 border-t border-line2 pt-3.5">
            {/* dev-feedback #20 item 2: the status chip belongs in the detail
                view too, not just the collapsed row, so the "waiting on
                someone" state is unmistakable however Jordan is looking at
                the task. */}
            <TaskMetaChips t={t} />
          </div>

          <TaskSubitems checklist={checklist} onChange={onChecklistChange} />
        </div>

        {/* Right: what's happening on it (the update log is the centerpiece) */}
        <div className="min-w-0 border-t border-line2 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            {/* dev-feedback #19: labeled "Activity" (not "Update log") so it
                reads as the answer to "track anything related to this task
                directly under an activity view," which is Jordan's own
                phrasing for this section. */}
            <div className="eyebrow flex items-center gap-1.5 text-muted">
              <ActivityIcon className="h-3.5 w-3.5" />
              Activity
            </div>
            {/* dev-feedback #18: one click to either reply on a linked thread
                or start a new email, without duplicating a reply composer here. */}
            <TaskEmailAction
              sourceFile={t.sourceFile}
              sourceLine={t.sourceLine}
              accountSlug={t.accountSlug}
              subject={cleanTitle(t.title)}
            />
          </div>
          <TaskUpdateLog sourceFile={t.sourceFile} sourceLine={t.sourceLine} refreshToken={refreshToken} />

          <div className="mt-4 grid gap-2.5 border-t border-line2 pt-3.5">
            <TaskLinkedEmails sourceFile={t.sourceFile} sourceLine={t.sourceLine} onLinked={bumpRefresh} />
            <TaskLinkedMeetings sourceFile={t.sourceFile} sourceLine={t.sourceLine} onLinked={bumpRefresh} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-items checklist (dev-feedback #20 item 3): a genuinely lightweight
// add/toggle list, the table view's counterpart to TasksGrouped's TaskCard
// "Internal progress" section. Both read/write the same task_meta.checklist
// (lib/taskMeta.ts) so a step checked off in one view is checked off in the
// other, rather than two competing "sub-items" stores. Deliberately skips
// TaskCard's "blocking" toggle here: Jordan asked for "sub-items, checked
// off," not a second blocking mechanism, so this stays a plain checklist.
function TaskSubitems({
  checklist,
  onChange,
}: {
  checklist: ChecklistStep[];
  onChange: (next: ChecklistStep[]) => void;
}) {
  const [newStep, setNewStep] = useState("");
  const progress = formatChecklistProgress(checklist);

  function addStep() {
    const text = newStep.trim();
    if (!text) return;
    onChange([...checklist, { id: `s${Date.now()}`, text, done: false }]);
    setNewStep("");
  }
  function toggleStep(id: string) {
    onChange(checklist.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }
  function removeStep(id: string) {
    onChange(checklist.filter((s) => s.id !== id));
  }

  return (
    <div className="mt-4 border-t border-line2 pt-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="eyebrow text-muted">Sub-items</div>
        {progress ? <span className="text-2xs text-muted">{progress} done</span> : null}
      </div>
      {checklist.length ? (
        <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-surface2">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${(checklistProgress(checklist).done / checklist.length) * 100}%` }}
          />
        </div>
      ) : null}
      <div className="space-y-1">
        {checklist.map((s) => (
          <div key={s.id} className="group flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => toggleStep(s.id)}
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] ${
                s.done ? "border-accent bg-accent text-white" : "border-line2 text-transparent"
              }`}
            >
              ✓
            </button>
            <span className={`flex-1 ${s.done ? "text-muted line-through" : "text-fg/85"}`}>{s.text}</span>
            <button
              type="button"
              onClick={() => removeStep(s.id)}
              className="shrink-0 text-2xs text-muted opacity-0 hover:text-danger group-hover:opacity-100"
              aria-label="Remove sub-item"
            >
              ×
            </button>
          </div>
        ))}
        {!checklist.length ? <p className="text-2xs text-muted">No sub-items yet.</p> : null}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addStep()}
          placeholder="Add sub-item…"
          className="input flex-1 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={addStep}
          className="rounded-lg border border-border px-2 py-1 text-xs text-fg/70 hover:text-fg"
        >
          Add
        </button>
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
