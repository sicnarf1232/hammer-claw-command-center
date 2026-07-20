import type { Priority, Workstream } from "@/lib/vault/types";
import { WORKSTREAMS } from "@/lib/workstreams";
import { formatDateShort } from "@/lib/dates";
import { AlertIcon, ClockIcon } from "./icons";

const WS_STYLES: Record<Workstream, string> = {
  merit: "border-merit/25 bg-merit/10 text-merit",
  sloan: "border-sloan/25 bg-sloan/10 text-sloan",
  personal: "border-personal/25 bg-personal/10 text-personal",
  shared: "border-shared/25 bg-shared/10 text-shared",
};

export function WorkstreamChip({ ws }: { ws?: string }) {
  if (!ws) return null;
  const known = ws in WORKSTREAMS ? (ws as Workstream) : undefined;
  const style = known
    ? WS_STYLES[known]
    : "border-border bg-surface2 text-muted";
  const label = known ? WORKSTREAMS[known].label : ws;
  return <span className={`chip ${style}`}>{label}</span>;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "border-danger/25 bg-danger/10 text-danger",
  med: "border-warning/25 bg-warning/10 text-warning",
  low: "border-border bg-surface2 text-muted",
};

export function PriorityChip({ priority }: { priority?: Priority }) {
  if (!priority) return null;
  return (
    <span className={`chip ${PRIORITY_STYLES[priority]}`}>
      {priority === "high" && <AlertIcon className="h-3 w-3" />}
      {priority}
    </span>
  );
}

export function DueChip({ due, today }: { due?: string; today: string }) {
  if (!due) return null;
  const overdue = due < today;
  const isToday = due === today;
  const style = overdue
    ? "border-danger/30 bg-danger/10 text-danger"
    : isToday
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-border bg-surface2 text-muted";
  const label = overdue
    ? `overdue ${formatDateShort(due)}`
    : isToday
      ? "due today"
      : `due ${formatDateShort(due)}`;
  return (
    <span className={`chip ${style}`}>
      {overdue && <AlertIcon className="h-3 w-3" />}
      {isToday && <ClockIcon className="h-3 w-3" />}
      {label}
    </span>
  );
}

// Generic chip for roster classification etc.
export function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "merit" | "customer";
}) {
  const styles: Record<string, string> = {
    gray: "border-border bg-surface2 text-muted",
    merit: "border-merit/25 bg-merit/10 text-merit",
    customer: "border-success/25 bg-success/10 text-success",
  };
  return <span className={`chip ${styles[tone]}`}>{children}</span>;
}
