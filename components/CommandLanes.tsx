"use client";

import Link from "next/link";
import type { LaneEntry, LaneResult } from "@/lib/attention";
import { laneOverflow } from "@/lib/attention";
import type { TaskView } from "@/lib/taskView";
import TaskRow from "./TaskRow";

// Today command lanes: Now / Next / Watch (plan section 4). Every card is a
// real task with a derived, human-readable reason chip; empty lanes state
// their emptiness plainly. Layout inspired by the reference lane grid; all
// styling is Main St. tokens.

const LANES: Array<{
  key: keyof Pick<LaneResult, "now" | "next" | "watch">;
  title: string;
  hint: string;
  empty: string;
  chip: string;
}> = [
  {
    key: "now",
    title: "Now",
    hint: "Needs you today",
    empty: "Nothing needs you right now.",
    chip: "border-danger/40 text-danger",
  },
  {
    key: "next",
    title: "Next",
    hint: "Coming this week",
    empty: "Nothing queued this week.",
    chip: "border-accent/40 text-accent",
  },
  {
    key: "watch",
    title: "Watch",
    hint: "With someone else",
    empty: "Nothing waiting on others.",
    chip: "border-border text-muted",
  },
];

export default function CommandLanes({
  lanes,
  today,
}: {
  lanes: LaneResult;
  today: string;
}) {
  const allEmpty =
    lanes.now.length === 0 && lanes.next.length === 0 && lanes.watch.length === 0;

  if (allEmpty) {
    return (
      <div className="card max-w-2xl p-8 text-center">
        <div className="text-sm font-medium text-fg">You are clear.</div>
        <p className="mt-1 text-sm text-muted">
          Nothing is due, queued, or waiting on others.
          {lanes.rest.length > 0 ? (
            <>
              {" "}
              <Link href="/tasks" className="text-primary hover:underline">
                Check the board
              </Link>{" "}
              for the {lanes.rest.length} backlog task
              {lanes.rest.length === 1 ? "" : "s"}.
            </>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {LANES.map((lane) => {
        const entries = lanes[lane.key];
        const { visible, more } = laneOverflow(entries);
        const headingId = `lane-${lane.key}`;
        return (
          <section
            key={lane.key}
            aria-labelledby={headingId}
            className="card overflow-hidden p-0"
          >
            <div className="flex items-baseline justify-between border-b border-border px-3.5 py-2.5">
              <h3 id={headingId} className="eyebrow text-fg">
                {lane.title}
              </h3>
              <span className="text-2xs text-muted">
                {entries.length ? `${entries.length} · ${lane.hint}` : lane.hint}
              </span>
            </div>
            <div className="space-y-2 p-2.5">
              {visible.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted">{lane.empty}</p>
              ) : (
                visible.map((e) => (
                  <LaneCard key={e.view.id} entry={e} today={today} chipClass={lane.chip} />
                ))
              )}
              {more > 0 ? (
                <Link
                  href="/tasks"
                  className="block px-1 pb-1 text-2xs text-muted hover:text-fg"
                >
                  {more} more · View all tasks →
                </Link>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// One lane card: the shared TaskRow (checkbox, title, context sub-line, due/
// priority chips) with the lane reason as a leading chip so the "why is this
// here" is always visible.
function LaneCard({
  entry,
  today,
  chipClass,
}: {
  entry: LaneEntry;
  today: string;
  chipClass: string;
}) {
  return (
    <article aria-label={laneCardLabel(entry.view, entry.reason)}>
      <div className="mb-1 px-0.5">
        <span className={`chip ${chipClass}`}>{entry.reason}</span>
      </div>
      <TaskRow task={entry.view} today={today} />
    </article>
  );
}

function laneCardLabel(t: TaskView, reason: string): string {
  return `${t.title} (${reason})`;
}
