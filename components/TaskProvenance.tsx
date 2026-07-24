import Link from "next/link";
import type { TaskView } from "@/lib/taskView";

// "Created from" block for task detail (plan section 3). Truthful provenance
// only: the source meeting comes from tasks.meeting_id (written at proposal
// approval); the owner line is the task's CURRENT owner ("Delegated to"),
// never the original extraction, which this join does not carry. Renders
// nothing when the task has no source meeting — absence IS the empty state.

export default function TaskProvenance({ task }: { task: TaskView }) {
  const m = task.sourceMeeting;
  if (!m) return null;
  const label = [m.title ?? "Untitled meeting", m.date].filter(Boolean).join(" — ");
  return (
    <div className="rounded-md border border-border bg-surface p-2.5">
      <div className="eyebrow mb-1 text-muted">Created from</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-fg/85">
          Meeting: <span className="font-medium text-fg">{label}</span>
        </span>
        {m.path ? (
          <Link
            href={`/meetings?note=${encodeURIComponent(m.path)}`}
            className="text-primary hover:underline"
            aria-label={`Open meeting: ${m.title ?? m.path}`}
          >
            Open meeting →
          </Link>
        ) : null}
      </div>
      {(task.delegatedTo || task.taskStatus) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
          {task.delegatedTo ? <span>Delegated to: {task.delegatedTo.name}</span> : null}
          {task.taskStatus ? <span>Status: {task.taskStatus}</span> : null}
        </div>
      )}
    </div>
  );
}
