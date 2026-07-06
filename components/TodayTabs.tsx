"use client";

import { useState } from "react";
import type { TaskView } from "@/lib/taskView";
import TaskList from "./TaskList";
import BuildYourDay from "./BuildYourDay";

// Today has two tabs: the focus queue (grouped task list) and the day planner.
export default function TodayTabs({ tasks, today }: { tasks: TaskView[]; today: string }) {
  const [tab, setTab] = useState<"focus" | "build">("focus");

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl border border-border bg-surface p-0.5">
        {(["focus", "build"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-[10px] px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              tab === t ? "bg-accent text-primary-fg" : "text-muted hover:text-fg"
            }`}
          >
            {t === "focus" ? "Focus queue" : "Build your day"}
          </button>
        ))}
      </div>

      {tab === "focus" ? (
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
