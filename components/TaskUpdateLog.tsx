"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { formatDateMDY, todayISO } from "@/lib/dates";
import { InboxIcon, MeetingsIcon, ClockIcon, SparkIcon } from "./icons";

// The task's update log (dev-feedback #16 Part A): a real, timestamped
// timeline, not the flat "notes" text field or a bare chip list. Manual
// entries come from the "Add update" box below; email-linked, meeting-linked,
// and status-change entries are written server-side (lib/taskUpdates.ts)
// whenever Jordan confirms a link or changes a field. This component is the
// centerpiece of "opening up" a task, per Jordan's dev-feedback #16 ask.

export interface TaskUpdateEntry {
  id: number;
  kind: "manual" | "email-linked" | "meeting-linked" | "status-change";
  text: string;
  sourceRef: string | null;
  createdAt: string; // ISO
}

const KIND_META: Record<
  TaskUpdateEntry["kind"],
  { color: string; label: string; Icon: (p: { className?: string }) => ReactElement }
> = {
  manual: { color: "var(--accent-2)", label: "Note", Icon: SparkIcon },
  "email-linked": { color: "var(--accent)", label: "Email", Icon: InboxIcon },
  "meeting-linked": { color: "var(--warm)", label: "Meeting", Icon: MeetingsIcon },
  "status-change": { color: "var(--ink-3)", label: "Change", Icon: ClockIcon },
};

// Short relative timestamp: "now" / "12m" / "3h" / weekday / MM/DD/YYYY,
// mirroring the pattern InboxWorkspace uses for message timestamps.
function rel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return formatDateMDY(todayISO(d));
}

export default function TaskUpdateLog({
  sourceFile,
  sourceLine,
  refreshToken = 0,
}: {
  sourceFile: string;
  sourceLine: number;
  // Bump this from a parent (e.g. after a link confirm elsewhere in the task
  // detail view) to force a refetch without this component owning that state.
  refreshToken?: number;
}) {
  const [updates, setUpdates] = useState<TaskUpdateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/tasks/updates?sourceFile=${encodeURIComponent(sourceFile)}&sourceLine=${sourceLine}`)
      .then((r) => r.json())
      .then((data) => {
        setUpdates(Array.isArray(data.updates) ? data.updates : []);
        loadedOnce.current = true;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFile, sourceLine, refreshToken]);

  async function submit() {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setErr(null);
    try {
      const res = await fetch("/api/tasks/add-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFile, sourceLine, text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "Could not add the update.");
        return;
      }
      setUpdates((prev) => [
        { id: -Date.now(), kind: "manual", text, sourceRef: null, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setDraft("");
    } catch {
      setErr("Network error.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Add an update…"
          className="input flex-1 py-1.5 text-xs"
          disabled={posting}
        />
        <button
          type="button"
          onClick={submit}
          disabled={posting || !draft.trim()}
          className="btn-outline shrink-0 px-2.5 py-1.5 text-xs disabled:opacity-40"
        >
          {posting ? "Adding…" : "Add"}
        </button>
      </div>
      {err ? <p className="mt-1 text-2xs text-danger">{err}</p> : null}

      <div className="mt-3">
        {loading && !loadedOnce.current ? (
          <p className="text-2xs text-muted">Loading update log…</p>
        ) : updates.length === 0 ? (
          <p className="text-2xs text-muted">
            No updates yet. Confirm a linked email or meeting, or add a note above, and it shows up here.
          </p>
        ) : (
          <ol className="relative">
            <div className="absolute bottom-1 left-[9px] top-1 w-px bg-line2" aria-hidden="true" />
            {updates.map((u) => {
              const meta = KIND_META[u.kind] ?? KIND_META.manual;
              const Icon = meta.Icon;
              return (
                <li key={u.id} className="relative flex gap-2.5 py-1.5 pl-0">
                  <span
                    className="relative z-[1] mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full ring-4 ring-surface"
                    style={{ background: `${meta.color}22`, color: meta.color }}
                    title={meta.label}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1 pb-0.5">
                    <p className="text-xs leading-snug text-fg/90">{u.text}</p>
                    <span className="text-2xs text-muted">{rel(u.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
