"use client";

import { useMemo, useState } from "react";
import type { TaskView } from "@/lib/taskView";
import TaskRow from "./TaskRow";
import { SearchIcon } from "./icons";

type GroupBy = "account" | "due" | "priority" | "none";

const PRIORITY_RANK: Record<string, number> = { high: 0, med: 1, low: 2 };

export default function TaskList({
  tasks,
  today,
  defaultGroup = "account",
}: {
  tasks: TaskView[];
  today: string;
  defaultGroup?: GroupBy;
}) {
  const [group, setGroup] = useState<GroupBy>(defaultGroup);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (overdueOnly && !(t.due && t.due < today)) return false;
      if (needle) {
        const hay = `${t.title} ${t.customer ?? ""} ${t.description ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [tasks, overdueOnly, q, today]);

  const groups = useMemo(
    () => groupTasks(filtered, group, today),
    [filtered, group, today],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks…"
            className="input w-52 pl-8"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-[rgb(var(--c-primary))]"
            />
            Overdue only
          </label>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span>Group</span>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as GroupBy)}
              className="input py-1 text-xs"
            >
              <option value="account">Account</option>
              <option value="due">Due</option>
              <option value="priority">Priority</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-sm font-medium text-fg">No tasks match</div>
          <p className="mt-1 text-sm text-muted">
            Try clearing the search or the overdue filter.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              {group !== "none" && (
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-fg">
                    {g.label}
                  </h2>
                  <span className="chip border-border bg-surface2 text-muted">
                    {g.tasks.length}
                  </span>
                  {g.overdue > 0 && (
                    <span className="chip border-danger/25 bg-danger/10 text-danger">
                      {g.overdue} overdue
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={today}
                    showAccount={group !== "account"}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

interface Group {
  key: string;
  label: string;
  tasks: TaskView[];
  overdue: number;
}

function groupTasks(tasks: TaskView[], by: GroupBy, today: string): Group[] {
  const sortTasks = (a: TaskView, b: TaskView) => {
    const da = a.due ?? "9999-99-99";
    const db = b.due ?? "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    const pa = a.priority ? PRIORITY_RANK[a.priority] : 3;
    const pb = b.priority ? PRIORITY_RANK[b.priority] : 3;
    return pa - pb;
  };

  if (by === "none") {
    const sorted = [...tasks].sort(sortTasks);
    return [{ key: "all", label: "All", tasks: sorted, overdue: 0 }];
  }

  const buckets = new Map<string, { label: string; tasks: TaskView[] }>();
  const order: string[] = [];
  const put = (key: string, label: string, t: TaskView) => {
    if (!buckets.has(key)) {
      buckets.set(key, { label, tasks: [] });
      order.push(key);
    }
    buckets.get(key)!.tasks.push(t);
  };

  for (const t of tasks) {
    if (by === "account") {
      const label = t.customer && t.customer !== "internal" ? t.customer : "No account";
      put(label.toLowerCase(), label, t);
    } else if (by === "priority") {
      const p = t.priority ?? "none";
      put(p, p === "none" ? "No priority" : p[0].toUpperCase() + p.slice(1), t);
    } else {
      // due
      const b = dueBucket(t.due, today);
      put(b.key, b.label, t);
    }
  }

  let groups: Group[] = order.map((key) => {
    const b = buckets.get(key)!;
    return {
      key,
      label: b.label,
      tasks: b.tasks.sort(sortTasks),
      overdue: b.tasks.filter((t) => t.due && t.due < today).length,
    };
  });

  if (by === "account") {
    groups = groups.sort(
      (a, b) => b.overdue - a.overdue || b.tasks.length - a.tasks.length || a.label.localeCompare(b.label),
    );
  } else if (by === "due") {
    const rank: Record<string, number> = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 };
    groups = groups.sort((a, b) => (rank[a.key] ?? 9) - (rank[b.key] ?? 9));
  } else if (by === "priority") {
    const rank: Record<string, number> = { high: 0, med: 1, low: 2, none: 3 };
    groups = groups.sort((a, b) => (rank[a.key] ?? 9) - (rank[b.key] ?? 9));
  }
  return groups;
}

function dueBucket(due: string | undefined, today: string) {
  if (!due) return { key: "none", label: "No date" };
  if (due < today) return { key: "overdue", label: "Overdue" };
  if (due === today) return { key: "today", label: "Today" };
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 7);
  const soonISO = soon.toISOString().slice(0, 10);
  if (due <= soonISO) return { key: "soon", label: "Next 7 days" };
  return { key: "later", label: "Later" };
}
