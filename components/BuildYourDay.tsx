"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TaskView } from "@/lib/taskView";
import { customerHue } from "@/lib/customerHues";

// Build Your Day: a lightweight time-blocking planner over today's open tasks.
// The plan (task -> {start, duration, done}) persists to localStorage per day;
// Phase 4 swaps this for /api/day-plan. Calendar events come from
// /api/calendar/today (empty until the Power Automate calendar flow is live).

const DAY_START = 8 * 60; // 8:00
const DAY_END = 19 * 60; // 19:00
const SLOT = 30; // minutes per row
const ROW_PX = 52;
const DURATIONS = [15, 30, 45, 60, 90, 120];

interface TaskBlock {
  start: number; // minutes from midnight
  duration: number;
  done: boolean;
}
type Plan = Record<string, TaskBlock>;

interface CalEvent {
  id: string;
  title: string;
  startISO: string;
  endISO: string;
  location?: string | null;
}

function planKey(today: string) {
  return `day-plan:${today}`;
}

function loadPlan(today: string): Plan {
  try {
    const raw = localStorage.getItem(planKey(today));
    return raw ? (JSON.parse(raw) as Plan) : {};
  } catch {
    return {};
  }
}

// Yesterday's not-done blocks roll into today (intention moves; task stays open).
function loadRollover(today: string): Set<string> {
  try {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - 1);
    const y = d.toISOString().slice(0, 10);
    const prev = JSON.parse(localStorage.getItem(planKey(y)) || "{}") as Plan;
    return new Set(Object.entries(prev).filter(([, b]) => !b.done).map(([id]) => id));
  } catch {
    return new Set();
  }
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "am" : "pm";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${m ? ":" + String(m).padStart(2, "0") : ""}${ampm}`;
}

function daysUntil(due: string | undefined, today: string): number | null {
  if (!due) return null;
  const a = new Date(due + "T12:00:00").getTime();
  const b = new Date(today + "T12:00:00").getTime();
  return Math.round((a - b) / 86400000);
}

function urgencyColor(due: string | undefined, today: string): string {
  const d = daysUntil(due, today);
  if (d == null) return "var(--line-2)";
  if (d < 0) return "var(--due)";
  if (d <= 2) return "var(--warm)";
  return "var(--accent)";
}

function eventMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export default function BuildYourDay({ tasks, today }: { tasks: TaskView[]; today: string }) {
  const [plan, setPlan] = useState<Plan>({});
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [rollover, setRollover] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    // Seed from localStorage immediately (offline mirror), then reconcile with
    // the server plan so the day survives across devices.
    setPlan(loadPlan(today));
    setRollover(loadRollover(today));
    const now = new Date();
    setNowMin(now.getHours() * 60 + now.getMinutes());
    fetch("/api/calendar/today")
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d?.events) ? d.events : []))
      .catch(() => {});
    fetch(`/api/day-plan?date=${today}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.plan && Object.keys(d.plan).length) setPlan(d.plan as Plan);
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, [today]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(planKey(today), JSON.stringify(plan));
    } catch {}
    fetch("/api/day-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, plan }),
    }).catch(() => {});
  }, [plan, today]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const scheduled = useMemo(
    () => Object.entries(plan).filter(([id]) => byId.has(id)),
    [plan, byId],
  );
  const scheduledIds = useMemo(() => new Set(scheduled.map(([id]) => id)), [scheduled]);

  const unscheduled = useMemo(
    () => tasks.filter((t) => !t.done && !scheduledIds.has(t.id)),
    [tasks, scheduledIds],
  );

  // Group unscheduled: overdue -> due soon (0-2) -> this week/other.
  const groups = useMemo(() => {
    const overdue: TaskView[] = [];
    const soon: TaskView[] = [];
    const later: TaskView[] = [];
    for (const t of unscheduled) {
      const d = daysUntil(t.due, today);
      if (d != null && d < 0) overdue.push(t);
      else if (d != null && d <= 2) soon.push(t);
      else later.push(t);
    }
    return { overdue, soon, later };
  }, [unscheduled, today]);

  // Occupied minute-ranges (calendar events + scheduled blocks) for slot-fill.
  function occupied(exceptId?: string): [number, number][] {
    const ranges: [number, number][] = events.map((e) => [eventMinutes(e.startISO), eventMinutes(e.endISO)]);
    for (const [id, b] of scheduled) {
      if (id === exceptId) continue;
      ranges.push([b.start, b.start + b.duration]);
    }
    return ranges;
  }

  function firstFreeSlot(duration: number, ranges: [number, number][], from = DAY_START): number | null {
    for (let s = from; s + duration <= DAY_END; s += SLOT) {
      const clash = ranges.some(([a, b]) => s < b && s + duration > a);
      if (!clash) return s;
    }
    return null;
  }

  function schedule(id: string, start: number, duration: number) {
    setPlan((p) => ({ ...p, [id]: { start, duration, done: p[id]?.done ?? false } }));
    setScheduling(null);
  }

  function planMyDay() {
    // Greedy fill: urgency order, high priority gets 60m else 30m.
    const order = [...groups.overdue, ...groups.soon, ...groups.later];
    setPlan((prev) => {
      const next: Plan = { ...prev };
      const ranges: [number, number][] = events.map((e) => [eventMinutes(e.startISO), eventMinutes(e.endISO)]);
      for (const [id, b] of Object.entries(next)) {
        if (byId.has(id)) ranges.push([b.start, b.start + b.duration]);
      }
      for (const t of order) {
        const dur = t.priority === "high" ? 60 : 30;
        const start = firstFreeSlot(dur, ranges);
        if (start == null) break;
        next[t.id] = { start, duration: dur, done: false };
        ranges.push([start, start + dur]);
      }
      return next;
    });
  }

  function toggleDone(id: string) {
    setPlan((p) => (p[id] ? { ...p, [id]: { ...p[id], done: !p[id].done } } : p));
  }
  function remove(id: string) {
    setPlan((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  }

  // Stats
  const taskMinutes = scheduled.reduce((s, [, b]) => s + b.duration, 0);
  const meetingMinutes = events.reduce((s, e) => s + (eventMinutes(e.endISO) - eventMinutes(e.startISO)), 0);
  const openMinutes = Math.max(0, DAY_END - DAY_START - taskMinutes - meetingMinutes);
  const notDone = scheduled.filter(([, b]) => !b.done).length;

  const rows: number[] = [];
  for (let m = DAY_START; m < DAY_END; m += SLOT) rows.push(m);

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      {/* Left — task queue */}
      <div className="w-full shrink-0 lg:w-[300px]">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Stat label="Meetings" value={`${(meetingMinutes / 60).toFixed(meetingMinutes % 60 ? 1 : 0)}h`} />
          <Stat label="Task time" value={`${(taskMinutes / 60).toFixed(taskMinutes % 60 ? 1 : 0)}h`} />
          <Stat label="Open" value={`${(openMinutes / 60).toFixed(openMinutes % 60 ? 1 : 0)}h`} />
        </div>

        <button onClick={planMyDay} className="btn-primary mb-4 w-full">
          <SparkGlyph className="h-4 w-4" /> Plan my day
        </button>

        {groups.overdue.length > 0 && rollover.size > 0 ? (
          <div className="mb-3 rounded-xl border px-3 py-2 text-2xs font-medium" style={{ borderColor: "var(--warm)", background: "var(--warm-soft)", color: "var(--warm)" }}>
            {rollover.size} block{rollover.size === 1 ? "" : "s"} rolled over from yesterday.
          </div>
        ) : null}

        <TaskGroup title="Overdue" tasks={groups.overdue} today={today} scheduling={scheduling} setScheduling={setScheduling} onSchedule={schedule} occupied={occupied} firstFreeSlot={firstFreeSlot} rollover={rollover} />
        <TaskGroup title="Due soon" tasks={groups.soon} today={today} scheduling={scheduling} setScheduling={setScheduling} onSchedule={schedule} occupied={occupied} firstFreeSlot={firstFreeSlot} rollover={rollover} />
        <TaskGroup title="This week" tasks={groups.later} today={today} scheduling={scheduling} setScheduling={setScheduling} onSchedule={schedule} occupied={occupied} firstFreeSlot={firstFreeSlot} rollover={rollover} />

        {unscheduled.length === 0 ? (
          <p className="px-1 text-sm text-muted">Everything is scheduled. 🎉</p>
        ) : null}
      </div>

      {/* Right — timeline */}
      <div className="min-w-0 flex-1">
        <div className="relative rounded-2xl border border-border bg-surface">
          {rows.map((m, i) => (
            <div key={m} className="relative flex" style={{ height: ROW_PX }}>
              <div className="w-14 shrink-0 border-r border-border pr-2 pt-1 text-right text-2xs tabular-nums text-muted">
                {m % 60 === 0 ? fmtTime(m) : ""}
              </div>
              <div className={`flex-1 ${i === 0 ? "" : "border-t border-border"}`} />
            </div>
          ))}

          {/* Calendar events (fixed) */}
          {events.map((e) => {
            const s = eventMinutes(e.startISO);
            const dur = eventMinutes(e.endISO) - s;
            if (s < DAY_START || s >= DAY_END) return null;
            return (
              <Block key={e.id} top={s} height={dur} left border="var(--info)">
                <div className="text-xs font-semibold text-fg">{e.title}</div>
                <div className="text-2xs text-muted">
                  {fmtTime(s)}–{fmtTime(s + dur)} {e.location ? `· ${e.location}` : "· Meeting"}
                </div>
              </Block>
            );
          })}

          {/* Scheduled task blocks */}
          {scheduled.map(([id, b]) => {
            const t = byId.get(id)!;
            if (b.start < DAY_START || b.start >= DAY_END) return null;
            const hue = customerHue(t.customer || t.title);
            return (
              <Block key={id} top={b.start} height={b.duration} left border={urgencyColor(t.due, today)} tint={b.done ? "var(--accent-soft)" : hue.soft}>
                <div className="flex items-start justify-between gap-1">
                  <div className={`min-w-0 text-xs font-semibold ${b.done ? "text-accent line-through" : "text-fg"}`}>{t.title}</div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <MiniBtn label={b.done ? "Reopen" : "Mark done"} onClick={() => toggleDone(id)}>✓</MiniBtn>
                    <MiniBtn label="Remove" onClick={() => remove(id)}>×</MiniBtn>
                  </div>
                </div>
                <div className="text-2xs text-muted">
                  {t.customer ? `${t.customer} · ` : ""}
                  {fmtTime(b.start)} · {b.duration}m
                </div>
              </Block>
            );
          })}

          {/* Now line */}
          {nowMin != null && nowMin >= DAY_START && nowMin < DAY_END ? (
            <div
              className="pointer-events-none absolute left-14 right-0 z-20 flex items-center"
              style={{ top: ((nowMin - DAY_START) / SLOT) * ROW_PX }}
            >
              <span className="h-2 w-2 -translate-x-1 rounded-full" style={{ background: "var(--due)" }} />
              <span className="h-px flex-1" style={{ background: "var(--due)" }} />
            </div>
          ) : null}
        </div>

        {notDone > 0 ? (
          <p className="mt-2 px-1 text-2xs text-muted">
            {notDone} block{notDone === 1 ? "" : "s"} not yet done will roll to tomorrow.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-2.5 py-2 text-center">
      <div className="text-lg font-bold tabular-nums text-fg">{value}</div>
      <div className="text-[10px] font-medium text-muted">{label}</div>
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  today,
  scheduling,
  setScheduling,
  onSchedule,
  occupied,
  firstFreeSlot,
  rollover,
}: {
  title: string;
  tasks: TaskView[];
  today: string;
  scheduling: string | null;
  setScheduling: (id: string | null) => void;
  onSchedule: (id: string, start: number, duration: number) => void;
  occupied: (exceptId?: string) => [number, number][];
  firstFreeSlot: (duration: number, ranges: [number, number][], from?: number) => number | null;
  rollover: Set<string>;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="eyebrow mb-1.5 px-1 text-[10px] text-muted">{title}</div>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <QueueTask
            key={t.id}
            t={t}
            today={today}
            open={scheduling === t.id}
            onToggle={() => setScheduling(scheduling === t.id ? null : t.id)}
            onSchedule={onSchedule}
            occupied={occupied}
            firstFreeSlot={firstFreeSlot}
            rolled={rollover.has(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function QueueTask({
  t,
  today,
  open,
  onToggle,
  onSchedule,
  occupied,
  firstFreeSlot,
  rolled,
}: {
  t: TaskView;
  today: string;
  open: boolean;
  onToggle: () => void;
  onSchedule: (id: string, start: number, duration: number) => void;
  occupied: (exceptId?: string) => [number, number][];
  firstFreeSlot: (duration: number, ranges: [number, number][], from?: number) => number | null;
  rolled: boolean;
}) {
  const [start, setStart] = useState<number>(() => firstFreeSlot(30, occupied()) ?? DAY_START);
  const color = urgencyColor(t.due, today);
  const d = daysUntil(t.due, today);
  const label = d == null ? "" : d < 0 ? `${-d}d overdue` : d === 0 ? "today" : `${d}d left`;

  const slotOptions: number[] = [];
  for (let m = DAY_START; m < DAY_END; m += SLOT) slotOptions.push(m);

  return (
    <div className="rounded-xl border border-border bg-surface" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {rolled ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--warm)" }} title="Rolled from yesterday" /> : null}
            <span className="truncate text-sm font-medium text-fg">{t.title}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-2xs">
            {t.customer ? <span className="truncate text-muted">{t.customer}</span> : null}
            {label ? <span style={{ color }}>{label}</span> : null}
          </div>
        </div>
        <button onClick={onToggle} className="shrink-0 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-fg/70 hover:text-fg">
          {open ? "Cancel" : "Schedule"}
        </button>
      </div>
      {open ? (
        <div className="border-t border-border px-2.5 py-2">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xs text-muted">Start</span>
            <select
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              className="input px-2 py-1 text-xs"
            >
              {slotOptions.map((m) => (
                <option key={m} value={m}>
                  {fmtTime(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1">
            {DURATIONS.map((dur) => (
              <button
                key={dur}
                onClick={() => onSchedule(t.id, start, dur)}
                className="rounded-lg border border-border px-2 py-1 text-2xs font-medium text-fg/70 hover:border-accent hover:text-accent"
              >
                {dur >= 60 ? `${dur / 60}h`.replace(".5h", ".5h") : `${dur}m`}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Block({
  top,
  height,
  border,
  tint,
  left,
  children,
}: {
  top: number;
  height: number;
  border: string;
  tint?: string;
  left?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute right-2 z-10 overflow-hidden rounded-lg border px-2 py-1"
      style={{
        top: ((top - DAY_START) / SLOT) * ROW_PX + 2,
        height: (height / SLOT) * ROW_PX - 4,
        left: "3.75rem",
        borderColor: "var(--border, var(--line))",
        borderLeft: `3px solid ${border}`,
        background: tint ?? "var(--surface-2)",
      }}
    >
      {children}
    </div>
  );
}

function MiniBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-5 w-5 items-center justify-center rounded-md text-2xs text-muted hover:bg-surface2 hover:text-fg"
    >
      {children}
    </button>
  );
}

function SparkGlyph({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4"} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.9 5.6a2 2 0 0 0 1.3 1.3L21 11l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 11l5.8-1.9a2 2 0 0 0 1.3-1.3z" />
    </svg>
  );
}
