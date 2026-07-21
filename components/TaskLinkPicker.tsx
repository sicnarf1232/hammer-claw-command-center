"use client";

import { useEffect, useRef, useState } from "react";

// General, manual "link to task(s)" picker (dev-feedback #15): search open
// tasks by title/account text, click to add to a selected set, remove before
// confirming. Distinct from the AI-suggestion accept/reject flow in
// components/TaskEmailLink.tsx: here Jordan deliberately picks any number of
// tasks himself, for an EXISTING email (ThreadDetail, emailId set: commits
// immediately via /api/emails/link-tasks) or a brand-new one still being
// composed (Composer, emailId null: selection just rides along in state
// until send, then the compose page queues a pending link since a new
// outbound email has no id yet).

export interface PickedTask {
  id: string; // TaskView id: sourceFile:sourceLine
  title: string;
  customer: string | null;
}

export default function TaskLinkPicker({
  emailId,
  selected,
  onChange,
}: {
  emailId?: number | null;
  selected: PickedTask[];
  onChange: (tasks: PickedTask[]) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedTask[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkedNote, setLinkedNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const rows: PickedTask[] = Array.isArray(data.results)
          ? data.results.map((r: { id: string; title: string; customer: string | null }) => ({
              id: r.id,
              title: r.title,
              customer: r.customer,
            }))
          : [];
        const selectedIds = new Set(selected.map((s) => s.id));
        setResults(rows.filter((r) => !selectedIds.has(r.id)));
      } catch {
        setResults([]);
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  function add(t: PickedTask) {
    onChange([...selected, t]);
    setQ("");
    setResults((prev) => prev.filter((r) => r.id !== t.id));
  }

  function remove(id: string) {
    onChange(selected.filter((t) => t.id !== id));
  }

  async function commitNow() {
    if (!emailId || !selected.length || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/emails/link-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, taskIds: selected.map((t) => t.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not link the task(s).");
      } else {
        setLinkedNote(`Linked ${selected.length} task${selected.length === 1 ? "" : "s"}.`);
        onChange([]);
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-dashed border-line2 p-2.5">
      <div className="text-2xs font-semibold uppercase tracking-wide text-muted">Link to task(s)</div>
      {selected.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <span key={t.id} className="chip border-accent2 text-2xs text-accent2">
              {t.title}
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="ml-1.5 text-muted hover:text-danger"
                title="Remove"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative mt-1.5">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Search open tasks by title or account…"
          className="input w-full text-xs"
        />
        {open && results.length ? (
          <ul className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-auto rounded-xl border border-border bg-surface shadow-elevated">
            {results.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(t)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-fg/85 hover:bg-surface2"
                >
                  <span className="min-w-0 truncate">{t.title}</span>
                  {t.customer ? <span className="shrink-0 text-2xs text-muted">{t.customer}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {emailId != null ? (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={commitNow}
            disabled={!selected.length || busy}
            className="rounded-lg border border-accent px-2 py-0.5 text-2xs font-semibold text-accent hover:bg-accentSoft disabled:opacity-50"
          >
            {busy ? "Linking…" : `Link ${selected.length || ""} task${selected.length === 1 ? "" : "s"}`}
          </button>
          {linkedNote ? <span className="text-2xs text-ok">{linkedNote}</span> : null}
        </div>
      ) : (
        <p className="mt-1.5 text-2xs text-muted">
          Linked once this email sends and Outlook captures it, best effort.
        </p>
      )}
      {err ? <p className="mt-1 text-2xs text-danger">{err}</p> : null}
    </div>
  );
}
