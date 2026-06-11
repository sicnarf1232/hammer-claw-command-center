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
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-slate-900">{task.title}</div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <DueChip due={task.due} today={today} />
          <PriorityChip priority={task.priority} />
          <WorkstreamChip ws={task.workstream} />
        </div>
      </div>
      {(customer || task.thread) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {customer && <span>customer: {customer}</span>}
          {task.thread && <span>thread {task.thread}</span>}
        </div>
      )}
      {task.description && (
        <p className="mt-2 text-sm text-slate-600">{task.description}</p>
      )}
      {task.notes && (
        <p className="mt-1 text-xs text-slate-400">Notes: {task.notes}</p>
      )}
      <div className="mt-2 truncate text-[11px] text-slate-300">
        {task.sourceFile}
      </div>
    </div>
  );
}
