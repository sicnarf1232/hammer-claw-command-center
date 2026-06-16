import type { Task } from "@/lib/vault/types";
import { WorkstreamChip, PriorityChip, DueChip } from "./chips";

function customerDisplay(task: Task): string | null {
  if (!task.customer) return null;
  if (task.customer === "internal") return "internal";
  return task.customer.display;
}

export default function TaskCard({
  task,
  today,
}: {
  task: Task;
  today: string;
}) {
  const customer = customerDisplay(task);
  const overdue = !!task.due && task.due < today;
  const urgent = overdue || task.priority === "high";

  // A quiet left edge that turns red for overdue so the eye lands on it first.
  const edge = overdue
    ? "before:bg-danger"
    : task.priority === "high"
      ? "before:bg-warning"
      : "before:bg-transparent";

  return (
    <div
      className={`card relative overflow-hidden p-4 transition-shadow hover:shadow-elevated before:absolute before:inset-y-0 before:left-0 before:w-1 ${edge}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`text-[15px] leading-snug text-fg ${
            urgent ? "font-semibold" : "font-medium"
          }`}
        >
          {task.title}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <DueChip due={task.due} today={today} />
          <PriorityChip priority={task.priority} />
          <WorkstreamChip ws={task.workstream} />
        </div>
      </div>

      {(customer || task.thread) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {customer && (
            <span>
              customer: <span className="text-fg/80">{customer}</span>
            </span>
          )}
          {task.thread && <span className="font-mono">thread {task.thread}</span>}
        </div>
      )}

      {task.description && (
        <p className="mt-2 text-sm leading-relaxed text-fg/75">
          {task.description}
        </p>
      )}
      {task.notes && (
        <p className="mt-1 text-xs text-muted">Notes: {task.notes}</p>
      )}

      <div className="mt-2.5 truncate font-mono text-2xs text-muted/70">
        {task.sourceFile}
      </div>
    </div>
  );
}
