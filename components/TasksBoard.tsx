"use client";

import { useEffect, useState } from "react";
import type { TaskView } from "@/lib/taskView";
import type { TaskMeta } from "@/lib/taskMeta";
import TasksGrouped from "./TasksGrouped";
import TasksTable from "./TasksTable";

// Tasks page shell: toggles between the grouped-by-account view (default) and
// the sortable table view. Choice persists across visits.
export default function TasksBoard({
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
  // Inline account/type/status/due edits write straight to the DB (dev-feedback
  // #8), so they only work once the cutover has been seeded. Same gate as
  // QuickAddTask.
  canEdit?: boolean;
}) {
  const [view, setView] = useState<"grouped" | "table">("grouped");

  useEffect(() => {
    const v = localStorage.getItem("tasks-view");
    if (v === "table" || v === "grouped") setView(v);
  }, []);

  function choose(v: "grouped" | "table") {
    setView(v);
    try {
      localStorage.setItem("tasks-view", v);
    } catch {}
  }

  return (
    <div>
      <div className="mb-3 inline-flex rounded-xl border border-border bg-surface p-0.5">
        <ViewBtn active={view === "grouped"} onClick={() => choose("grouped")} label="Grouped">
          <GroupIcon />
        </ViewBtn>
        <ViewBtn active={view === "table"} onClick={() => choose("table")} label="Table">
          <TableIcon />
        </ViewBtn>
      </div>

      {view === "grouped" ? (
        <TasksGrouped tasks={tasks} today={today} meta={meta} accounts={accounts} canEdit={canEdit} />
      ) : (
        <TasksTable tasks={tasks} today={today} accounts={accounts} canEdit={canEdit} />
      )}
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? "bg-accent text-primary-fg" : "text-muted hover:text-fg"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

function GroupIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
    </svg>
  );
}
function TableIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M9 4v16" />
    </svg>
  );
}
