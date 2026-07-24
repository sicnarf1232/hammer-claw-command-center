"use client";

import { useState } from "react";
import Link from "next/link";
import type { TaskView } from "@/lib/taskView";
import { DueChip, PriorityChip, WorkstreamChip } from "./chips";
import { CheckIcon, CircleIcon, ChevronDownIcon } from "./icons";

export default function TaskRow({
  task,
  today,
  showAccount = true,
}: {
  task: TaskView;
  today: string;
  showAccount?: boolean;
}) {
  const [done, setDone] = useState(task.done);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const overdue = !done && !!task.due && task.due < today;
  const hasDetail = !!task.description || !!task.notes;

  async function toggle() {
    if (busy) return;
    const next = !done;
    setDone(next); // optimistic
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFile: task.sourceFile,
          sourceLine: task.sourceLine,
          done: next,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDone(!next); // revert
        setErr(data.error ?? "Could not update the task.");
      }
    } catch {
      setDone(!next);
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`card relative overflow-hidden p-3 transition-all before:absolute before:inset-y-0 before:left-0 before:w-1 ${
        done
          ? "opacity-60 before:bg-transparent"
          : overdue
            ? "before:bg-danger"
            : task.priority === "high"
              ? "before:bg-warning"
              : "before:bg-transparent"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-label={done ? "Reopen task" : "Complete task"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            done
              ? "border-success bg-success text-white"
              : "border-fg/35 text-transparent hover:border-success hover:text-success/40"
          }`}
        >
          {done ? (
            <CheckIcon className="h-3.5 w-3.5" />
          ) : (
            <CheckIcon className="h-3.5 w-3.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => hasDetail && setOpen((o) => !o)}
              className={`text-left text-sm leading-snug ${
                done ? "text-muted line-through" : "font-medium text-fg"
              } ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
            >
              {task.title}
            </button>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <DueChip due={task.due} today={today} />
              <PriorityChip priority={task.priority} />
              {task.taskStatus && (
                <span className="chip border-border bg-surface2 text-muted">
                  {task.taskStatus}
                </span>
              )}
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted">
            {showAccount && task.customer && task.customer !== "internal" && (
              task.accountSlug ? (
                <Link
                  href={`/accounts/${task.accountSlug}`}
                  className="font-medium text-primary hover:underline"
                >
                  {task.customer}
                </Link>
              ) : (
                <span className="font-medium text-fg/70">{task.customer}</span>
              )
            )}
            {task.workstream && task.workstream !== "merit" && (
              <WorkstreamChip ws={task.workstream} />
            )}
            {/* Owner: the current delegate, else Jordan himself. */}
            <span className="text-muted/90">
              {task.delegatedTo ? `Owner: ${task.delegatedTo.name}` : "Owner: You"}
            </span>
            {/* Source-meeting provenance (tasks.meeting_id): link when the
                meeting has a vault path, plain text otherwise. */}
            {task.sourceMeeting &&
              (task.sourceMeeting.path ? (
                <Link
                  href={`/meetings?note=${encodeURIComponent(task.sourceMeeting.path)}`}
                  className="text-muted hover:text-fg hover:underline"
                  aria-label={`Open meeting: ${task.sourceMeeting.title ?? "meeting"}`}
                >
                  From: {task.sourceMeeting.title ?? "meeting"}
                  {task.sourceMeeting.date ? ` (${task.sourceMeeting.date.slice(5)})` : ""}
                </Link>
              ) : (
                <span>
                  From: {task.sourceMeeting.title ?? "meeting"}
                  {task.sourceMeeting.date ? ` (${task.sourceMeeting.date.slice(5)})` : ""}
                </span>
              ))}
            {hasDetail && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-0.5 text-muted hover:text-fg"
              >
                <ChevronDownIcon
                  className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
                />
                {open ? "less" : "details"}
              </button>
            )}
          </div>

          {open && (
            <div className="mt-2 space-y-1.5 border-t border-border pt-2">
              {task.description && (
                <p className="text-sm leading-relaxed text-fg/75">
                  {task.description}
                </p>
              )}
              {task.notes && (
                <p className="text-xs text-muted">Notes: {task.notes}</p>
              )}
              <p className="truncate font-mono text-2xs text-muted/70">
                {task.sourceFile}
              </p>
            </div>
          )}
          {err && <p className="mt-1 text-2xs text-danger">{err}</p>}
        </div>
      </div>
    </div>
  );
}
