"use client";

import { useMemo, useState } from "react";
import type { TaskView } from "@/lib/taskView";
import { cleanTaskTitle as cleanTitle } from "@/lib/taskView";
import type { TaskMeta, ChecklistStep } from "@/lib/taskMeta";
import { customerHue, initials } from "@/lib/customerHues";
import { formatDateMDY, formatDateShort, todayISO } from "@/lib/dates";
import { TASK_TYPES, TASK_TYPE_HUE, type TaskType } from "@/lib/taskType";
import {
  TASK_STATUSES,
  applyTaskFieldUpdate,
  taskStatusLabel,
  taskStatusColorClass,
  type TaskUpdateField,
} from "@/lib/taskUpdate";
import { SearchIcon, ChevronDownIcon, ActivityIcon } from "./icons";
import DelegatePicker, { type DelegateCandidate } from "./DelegatePicker";
import TaskFieldEditor from "./TaskFieldEditor";
import TaskMetaChips from "./TaskMetaChips";
import TaskSuggestedAction from "./TaskSuggestedAction";
import { TaskLinkedEmails, TaskLinkedMeetings, TaskEmailAction } from "./TaskEmailLink";
import TaskUpdateLog from "./TaskUpdateLog";

// Grouped-by-account task view (the enhanced Tasks default). Each account group
// shows an urgency-bordered card per task; the header carries the overdue count.
//
// dev-feedback #21 parity pass: TaskCard below used to lag TasksTable.tsx's
// TaskDetail badly (raw always-open <select>s instead of the settled-chip
// TaskFieldEditor pattern, no status color/label treatment, no linked
// emails/meetings, no Activity log). It now renders the same set of
// capabilities via the same shared components (TaskFieldEditor,
// TaskMetaChips, TaskSuggestedAction, TaskLinkedEmails/Meetings,
// TaskEmailAction, TaskUpdateLog), just arranged for a narrower card instead
// of the table's two-column detail.

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
  return { color: null, label: due ? formatDateShort(due) : "" };
}

interface Group {
  key: string;
  name: string;
  slug?: string;
  tasks: TaskView[];
  overdue: number;
}

export default function TasksGrouped({
  tasks,
  today,
  meta = {},
  accounts = [],
  canEdit = false,
}: {
  tasks: TaskView[];
  today: string;
  meta?: Record<string, TaskMeta>;
  accounts?: string[];
  canEdit?: boolean;
}) {
  const [rows, setRows] = useState(tasks);
  const [q, setQ] = useState("");
  const [ws, setWs] = useState("merit");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  // Inline edit (dev-feedback #8): update one field on a task directly in the
  // DB. Optimistic with rollback on failure, mirroring complete() above. Note
  // reassigning the account moves the card to a different group on the next
  // render, since groups are derived from rows.
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
        setRows((prev) => prev.map((r) => (r.id === t.id ? t : r)));
        setFieldErrors((prev) => ({ ...prev, [errKey]: data.error ?? "Could not update the task." }));
      }
    } catch {
      setRows((prev) => prev.map((r) => (r.id === t.id ? t : r)));
      setFieldErrors((prev) => ({ ...prev, [errKey]: "Network error." }));
    }
  }

  // Delegate edit (dev-feedback #20 item 1): same reasoning as
  // TasksTable.tsx's updateDelegate, kept separate from updateField above
  // because the picker hands back a full { id, name, email } shape, not a
  // plain wire-format string.
  async function updateDelegate(t: TaskView, person: DelegateCandidate | null): Promise<boolean> {
    const errKey = `${t.id}:delegate`;
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[errKey];
      return next;
    });
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
        setRows((prev) => prev.map((r) => (r.id === t.id ? t : r)));
        setFieldErrors((prev) => ({ ...prev, [errKey]: data.error ?? "Could not update the task." }));
        return false;
      }
      return true;
    } catch {
      setRows((prev) => prev.map((r) => (r.id === t.id ? t : r)));
      setFieldErrors((prev) => ({ ...prev, [errKey]: "Network error." }));
      return false;
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
                      <TaskCard
                        key={t.id}
                        t={t}
                        today={today}
                        meta={meta[t.id]}
                        onComplete={() => complete(t)}
                        showAccount={!g.slug}
                        canEdit={canEdit}
                        accounts={accounts}
                        onFieldUpdate={(field, value) => updateField(t, field, value)}
                        onDelegateSave={(person) => updateDelegate(t, person)}
                        fieldErrors={fieldErrors}
                      />
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

function daysUntilNum(due: string | undefined, today: string): number | null {
  return daysUntil(due, today);
}

function isSameDay(iso: string | null, today: string): boolean {
  return !!iso && iso.slice(0, 10) === today;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  // Last-customer-update is a full timestamp; convert to the app's local
  // calendar date before handing it to the general MM/DD/YYYY formatter.
  return formatDateMDY(todayISO(new Date(iso)));
}

function TaskCard({
  t,
  today,
  meta,
  onComplete,
  showAccount,
  canEdit,
  accounts,
  onFieldUpdate,
  onDelegateSave,
  fieldErrors,
}: {
  t: TaskView;
  today: string;
  meta?: TaskMeta;
  onComplete: () => void;
  showAccount: boolean;
  canEdit: boolean;
  accounts: string[];
  onFieldUpdate: (field: TaskUpdateField, value: string) => void;
  onDelegateSave: (person: DelegateCandidate | null) => Promise<boolean>;
  fieldErrors: Record<string, string>;
}) {
  const u = urgency(t.due, today);
  const hasAccount = !!t.customer && t.customer !== "internal";
  const d = daysUntilNum(t.due, today);
  const eligible = hasAccount && d != null && d <= 5; // account + within 5 days/overdue

  const [open, setOpen] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistStep[]>(meta?.checklist ?? []);
  const [lastUpdate, setLastUpdate] = useState<string | null>(meta?.lastCustomerUpdateISO ?? null);
  const [newStep, setNewStep] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const linkedThreadKey = meta?.linkedThreadKey ?? null;
  // dev-feedback #21 parity pass: bump this after a linked email/meeting is
  // confirmed so TaskUpdateLog's Activity feed picks up the automatic log
  // entry, the same pattern TaskDetail (TasksTable.tsx) already uses.
  const [refreshToken, setRefreshToken] = useState(0);
  const bumpRefresh = () => setRefreshToken((x) => x + 1);

  const updatedToday = isSameDay(lastUpdate, today);
  const blockedInternally =
    (t.taskStatus ?? "").toLowerCase() === "blocked" || checklist.some((s) => s.blocking && !s.done);
  const doneSteps = checklist.filter((s) => s.done).length;

  async function persistChecklist(next: ChecklistStep[]) {
    setChecklist(next);
    await fetch("/api/tasks/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: t.id, checklist: next }),
    }).catch(() => {});
  }
  function addStep() {
    const text = newStep.trim();
    if (!text) return;
    persistChecklist([...checklist, { id: `s${Date.now()}`, text, done: false }]);
    setNewStep("");
  }
  function toggleStep(id: string) {
    persistChecklist(checklist.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }
  function toggleBlocking(id: string) {
    persistChecklist(checklist.map((s) => (s.id === id ? { ...s, blocking: !s.blocking } : s)));
  }

  async function draftUpdate() {
    setDrafting(true);
    setCopied(false);
    try {
      const res = await fetch("/api/tasks/update-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskTitle: cleanTitle(t.title), account: t.customer, due: t.due ?? null, blockedInternally }),
      });
      const data = await res.json();
      setDraft(res.ok ? htmlToText(data.body ?? "") : `Draft failed: ${data.error ?? "unknown error"}`);
    } catch {
      setDraft("Draft failed: network error.");
    } finally {
      setDrafting(false);
    }
  }
  async function markSent() {
    await fetch("/api/tasks/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: t.id, markCustomerUpdated: true }),
    }).catch(() => {});
    setLastUpdate(new Date().toISOString());
  }
  // Real send into the linked email thread (same Flow B path as the reply box).
  async function sendUpdate() {
    if (!draft?.trim() || sending) return;
    setSending(true);
    setSendNote(null);
    try {
      const res = await fetch("/api/tasks/send-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: t.id,
          bodyText: draft,
          workstream: t.workstream ?? "merit",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendNote(data.error ?? "Send failed.");
      } else {
        setLastUpdate(new Date().toISOString());
        setSendNote(`Sent to ${(data.to ?? []).join(", ") || "the linked thread"}.`);
      }
    } catch {
      setSendNote("Send failed: network error.");
    } finally {
      setSending(false);
    }
  }
  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {}
  }

  return (
    <div
      className="rounded-xl border border-border bg-surface"
      style={u.color ? { borderLeft: `3px solid ${u.color}` } : undefined}
    >
      <div className="flex items-start gap-2.5 px-3 py-2">
        <button
          type="button"
          onClick={onComplete}
          aria-label="Mark done"
          title="Mark done"
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-fg/35 text-transparent transition-colors hover:border-success hover:text-success"
        >
          ✓
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-fg">{cleanTitle(t.title)}</span>
            <div className="flex shrink-0 items-center gap-2">
              {u.label ? (
                <span className="text-2xs font-semibold" style={{ color: u.color ?? "var(--muted)" }}>
                  {u.label}
                </span>
              ) : null}
              <span className="text-muted transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
                ›
              </span>
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-muted">
            {showAccount && hasAccount ? <span className="font-medium text-fg/70">{t.customer}</span> : null}
            {t.type ? <span>{t.type}</span> : null}
            {checklist.length ? <span>{doneSteps}/{checklist.length} steps</span> : null}
            {/* dev-feedback #20 item 2: "waiting"/"blocked" get the same
                distinct chip color as the table view, so a task never reads
                as just-not-started-yet when it's actually in motion
                elsewhere. Same taskStatusLabel/taskStatusColorClass helpers
                as TasksTable.tsx, so the two views never disagree. */}
            {(t.taskStatus ?? "").toLowerCase() === "waiting" || (t.taskStatus ?? "").toLowerCase() === "blocked" ? (
              <span className={`chip whitespace-nowrap ${taskStatusColorClass(t.taskStatus)}`}>
                {taskStatusLabel(t.taskStatus, t.delegatedTo?.name)}
              </span>
            ) : t.delegatedTo ? (
              <span className="text-accent2">→ {t.delegatedTo.name}</span>
            ) : null}
            {blockedInternally ? <span className="font-semibold text-warm">blocked internally</span> : null}
          </div>
        </button>
        {eligible ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              if (!draft) draftUpdate();
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-2xs font-semibold text-white"
            style={{ background: updatedToday ? "var(--line-2)" : u.color ?? "var(--accent)" }}
            title={updatedToday ? "Already updated today" : "Draft a customer update"}
          >
            {updatedToday ? "Updated" : "Send update"}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="grid gap-3 border-t border-border px-3 py-3 md:grid-cols-2">
          {/* dev-feedback #21 parity pass: the same settled-chip,
              click-to-edit TaskFieldEditor pattern TasksTable.tsx's Row
              already uses, in place of the raw always-open <select>s this
              panel had before. Same chip styles, same "+ Add X" empty state. */}
          <div className="md:col-span-2">
            <TaskMetaChips t={t} />
          </div>

          {canEdit ? (
            <div className="md:col-span-2">
              <div className="eyebrow mb-1.5 text-[10px] text-muted">Task fields</div>
              <div className="flex flex-wrap items-start gap-2">
                <TaskFieldEditor
                  chip={
                    hasAccount ? (
                      <span className="chip whitespace-nowrap border-border bg-surface2 text-fg/80">
                        {t.customer}
                      </span>
                    ) : null
                  }
                  emptyLabel="Add account"
                  initialValue={hasAccount ? t.customer! : ""}
                  onSave={(value) => onFieldUpdate("account", value)}
                  error={fieldErrors[`${t.id}:account`]}
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
                <TaskFieldEditor
                  chip={
                    <span
                      className="chip whitespace-nowrap"
                      style={{
                        background: `${TASK_TYPE_HUE[t.type]}1a`,
                        color: TASK_TYPE_HUE[t.type],
                        borderColor: "transparent",
                      }}
                    >
                      {t.type}
                    </span>
                  }
                  emptyLabel="Add type"
                  initialValue={t.type}
                  onSave={(value) => onFieldUpdate("type", value)}
                  error={fieldErrors[`${t.id}:type`]}
                  renderControl={(value, setValue) => (
                    <select
                      aria-label="Type"
                      value={value}
                      onChange={(e) => setValue(e.target.value as TaskType)}
                      className="input py-1 text-xs"
                      style={{ color: TASK_TYPE_HUE[value as TaskType] }}
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
                <TaskFieldEditor
                  chip={
                    <span className={`chip whitespace-nowrap ${taskStatusColorClass(t.taskStatus)}`}>
                      {taskStatusLabel(t.taskStatus, t.delegatedTo?.name)}
                    </span>
                  }
                  emptyLabel="Add status"
                  initialValue={(t.taskStatus ?? "open").toLowerCase()}
                  onSave={(value) => onFieldUpdate("status", value)}
                  error={fieldErrors[`${t.id}:status`]}
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
                <TaskFieldEditor
                  chip={
                    t.due ? (
                      <span className="chip whitespace-nowrap">{formatDateShort(t.due)}</span>
                    ) : null
                  }
                  emptyLabel="Add due date"
                  initialValue={t.due ?? ""}
                  onSave={(value) => onFieldUpdate("due", value)}
                  error={fieldErrors[`${t.id}:due`]}
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
                  onSave={(person) => onDelegateSave(person)}
                  error={fieldErrors[`${t.id}:delegate`]}
                  renderControl={(value, setValue) => <DelegatePicker value={value} onChange={setValue} />}
                />
              </div>
            </div>
          ) : null}

          {/* Internal progress */}
          <div>
            <div className="eyebrow mb-1.5 text-[10px] text-muted">Internal progress</div>
            {checklist.length ? (
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(doneSteps / checklist.length) * 100}%` }} />
              </div>
            ) : null}
            <div className="space-y-1">
              {checklist.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
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
                    onClick={() => toggleBlocking(s.id)}
                    className={`shrink-0 text-[9px] font-semibold uppercase ${s.blocking ? "text-warm" : "text-muted/50 hover:text-muted"}`}
                    title="Toggle blocking"
                  >
                    block
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addStep()}
                placeholder="Add step…"
                className="input flex-1 px-2 py-1 text-xs"
              />
              <button type="button" onClick={addStep} className="rounded-lg border border-border px-2 py-1 text-xs text-fg/70 hover:text-fg">
                Add
              </button>
            </div>
          </div>

          {/* Customer update */}
          <div className="rounded-lg bg-surface2 p-2.5">
            <div className="flex items-center justify-between">
              <div className="eyebrow text-[10px] text-muted">Customer update</div>
              <span className="text-2xs text-muted">Last: {fmtDate(lastUpdate)}</span>
            </div>
            {!hasAccount ? (
              <p className="mt-2 text-2xs text-muted">Link this task to an account to draft an update.</p>
            ) : (
              <>
                {draft == null ? (
                  <button
                    type="button"
                    onClick={draftUpdate}
                    disabled={drafting}
                    className="btn-outline mt-2 w-full text-xs"
                  >
                    {drafting ? "Drafting…" : blockedInternally ? "Draft \"still working on it\"" : "Draft update"}
                  </button>
                ) : (
                  <>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="input mt-2 min-h-[6rem] w-full resize-y text-xs leading-relaxed"
                    />
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button type="button" onClick={copyDraft} className="btn-outline flex-1 text-xs">
                        {copied ? "Copied ✓" : "Copy"}
                      </button>
                      {linkedThreadKey ? (
                        <button
                          type="button"
                          onClick={sendUpdate}
                          disabled={sending}
                          className="btn-primary flex-1 text-xs disabled:opacity-60"
                          title="Send this update into the linked email thread"
                        >
                          {sending ? "Sending…" : "Send"}
                        </button>
                      ) : (
                        <button type="button" onClick={markSent} className="btn-primary flex-1 text-xs" title="Records that you sent an update yourself (from Outlook). To send from here, link an email thread to this task first.">
                          Mark sent
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDraft(null)}
                        aria-label="Discard draft"
                        className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg"
                      >
                        ×
                      </button>
                    </div>
                    {sendNote ? (
                      <p className={`mt-1.5 text-2xs ${sendNote.startsWith("Sent") ? "text-muted" : "text-danger"}`}>
                        {sendNote}
                      </p>
                    ) : null}
                    {!linkedThreadKey ? (
                      <p className="mt-1.5 text-2xs text-muted">
                        No linked thread: open the customer&apos;s email thread and use
                        &quot;Link to a task&quot; to enable sending from here.
                      </p>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>

          {t.description ? (
            <p className="whitespace-pre-wrap text-xs text-muted md:col-span-2">{t.description}</p>
          ) : null}

          {/* dev-feedback #21: a real judgment call about what Jordan needs
              to do next (draft an email to a named person, or build a
              quote), shared with TaskDetail (TasksTable.tsx) so both views
              always agree. Renders nothing when there is no clear action. */}
          <div className="md:col-span-2">
            <TaskSuggestedAction t={t} />
          </div>

          {/* dev-feedback #21 parity pass: Activity log + linked emails/
              meetings, entirely absent from this card before. Same
              components TaskDetail uses, so "unable to link emails or
              meetings from the task view" is fixed the same way in both
              views, not just the table. */}
          <div className="md:col-span-2 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="eyebrow flex items-center gap-1.5 text-muted">
                <ActivityIcon className="h-3.5 w-3.5" />
                Activity
              </div>
              <TaskEmailAction
                sourceFile={t.sourceFile}
                sourceLine={t.sourceLine}
                accountSlug={t.accountSlug}
                subject={cleanTitle(t.title)}
              />
            </div>
            <TaskUpdateLog sourceFile={t.sourceFile} sourceLine={t.sourceLine} refreshToken={refreshToken} />
            <div className="mt-3 grid gap-2 border-t border-line2 pt-2.5 sm:grid-cols-2">
              <TaskLinkedEmails sourceFile={t.sourceFile} sourceLine={t.sourceLine} onLinked={bumpRefresh} />
              <TaskLinkedMeetings sourceFile={t.sourceFile} sourceLine={t.sourceLine} onLinked={bumpRefresh} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Flatten the AI's small HTML update into plain text for the editable textarea.
function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6])>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
