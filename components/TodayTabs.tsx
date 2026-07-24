"use client";

import { useState } from "react";
import type { TaskView } from "@/lib/taskView";
import type { LaneResult } from "@/lib/attention";
import TaskList from "./TaskList";
import BuildYourDay from "./BuildYourDay";
import CommandLanes from "./CommandLanes";

// Today has three tabs: the command lanes (Now / Next / Watch, the default),
// the focus queue (due/overdue grouped list), and the day planner.
export default function TodayTabs({
  lanes,
  tasks,
  today,
}: {
  lanes: LaneResult;
  tasks: TaskView[]; // due or overdue, for the focus queue and planner
  today: string;
}) {
  const [tab, setTab] = useState<"lanes" | "focus" | "build">("lanes");

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl border border-border bg-surface p-0.5">
        {(
          [
            ["lanes", "Command lanes"],
            ["focus", "Focus queue"],
            ["build", "Build your day"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded-[10px] px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              tab === t ? "bg-accent text-primary-fg" : "text-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "lanes" ? (
        <CommandLanes lanes={lanes} today={today} />
      ) : tab === "focus" ? (
        tasks.length === 0 ? (
          <div className="card max-w-2xl p-8 text-center">
            <div className="text-sm font-medium text-fg">Nothing due today or overdue</div>
            <p className="mt-1 text-sm text-muted">You are clear for now.</p>
          </div>
        ) : (
          <TaskList tasks={tasks} today={today} defaultGroup="due" />
        )
      ) : (
        <BuildYourDay tasks={tasks} today={today} />
      )}
    </div>
  );
}
