import type { Priority, Workstream } from "@/lib/vault/types";
import { WORKSTREAMS } from "@/lib/workstreams";

const WS_STYLES: Record<Workstream, string> = {
  merit: "border-blue-200 bg-blue-50 text-blue-700",
  sloan: "border-teal-200 bg-teal-50 text-teal-700",
  personal: "border-slate-200 bg-slate-50 text-slate-600",
  shared: "border-slate-200 bg-slate-50 text-slate-500",
};

export function WorkstreamChip({ ws }: { ws?: string }) {
  if (!ws) return null;
  const known = ws in WORKSTREAMS ? (ws as Workstream) : undefined;
  const style = known ? WS_STYLES[known] : "border-slate-200 bg-slate-50 text-slate-500";
  const label = known ? WORKSTREAMS[known].label : ws;
  return <span className={`chip ${style}`}>{label}</span>;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "border-red-200 bg-red-50 text-red-700",
  med: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

export function PriorityChip({ priority }: { priority?: Priority }) {
  if (!priority) return null;
  return <span className={`chip ${PRIORITY_STYLES[priority]}`}>{priority}</span>;
}

export function DueChip({ due, today }: { due?: string; today: string }) {
  if (!due) return null;
  const overdue = due < today;
  const isToday = due === today;
  const style = overdue
    ? "border-red-200 bg-red-50 text-red-700"
    : isToday
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-600";
  const label = overdue ? `overdue ${due}` : isToday ? "due today" : `due ${due}`;
  return <span className={`chip ${style}`}>{label}</span>;
}

// Generic gray chip for roster classification etc.
export function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "merit" | "customer";
}) {
  const styles: Record<string, string> = {
    gray: "border-slate-200 bg-slate-50 text-slate-500",
    merit: "border-blue-200 bg-blue-50 text-blue-700",
    customer: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return <span className={`chip ${styles[tone]}`}>{children}</span>;
}
