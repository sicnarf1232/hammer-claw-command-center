"use client";

import { useMemo, useState } from "react";
import type { TaskView } from "@/lib/taskView";
import type { TaskMeta, ChecklistStep } from "@/lib/taskMeta";
import { customerHue, initials } from "@/lib/customerHues";
import { formatDateMDY, formatDateShort, todayISO } from "@/lib/dates";
import { TASK_TYPES } from "@/lib/taskType";
import {
  TASK_STATUSES,
  applyTaskFieldUpdate,
  type TaskUpdateField,
} from "@/lib/taskUpdate";
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
          {canEdit ? (
            <div className="md:col-span-2">
              <div className="eyebrow mb-1.5 text-[10px] text-muted">Task fields</div>
              <div className="flex flex-wrap items-start gap-2">
                <EditField label="Account" error={fieldErrors[`${t.id}:account`]}>
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
                </EditField>
                <EditField label="Type" error={fieldErrors[`${t.id}:type`]}>
                  <select
                    aria-label="Type"
                    value={t.type}
                    onChange={(e) => onFieldUpdate("type", e.target.value)}
                    className="input py-1 text-xs"
                  >
                    {TASK_TYPES.map((ty) => (
                      <option key={ty} value={ty}>
                        {ty}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField label="Status" error={fieldErrors[`${t.id}:status`]}>
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
                </EditField>
                <EditField label="Due" error={fieldErrors[`${t.id}:due`]}>
                  <input
                    type="date"
                    aria-label="Due date"
                    value={t.due ?? ""}
                    onChange={(e) => onFieldUpdate("due", e.target.value)}
                    className="input py-1 text-xs"
                  />
                </EditField>
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
        </div>
      ) : null}
    </div>
  );
}

function EditField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs text-muted">{label}</span>
      {children}
      {error && <p className="text-2xs text-danger">{error}</p>}
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
