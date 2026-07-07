"use client";

import { useState } from "react";

export interface LinkableTask {
  id: string;
  title: string;
  customer: string | null;
  due: string | null;
  priority: string | null;
}

// "Add action from this thread". Links this email thread to an existing open
// task via task_meta.linkedThreadKey, or creates a brand-new task (DB-first,
// Phase 2) already linked to the thread.
export default function ThreadActionComposer({
  threadKey,
  tasks,
  customer = null,
}: {
  threadKey: string;
  tasks: LinkableTask[];
  customer?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [created, setCreated] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  async function createTask() {
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy("create");
    setCreateErr(null);
    try {
      const res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          due: newDue || undefined,
          customer: customer ?? undefined,
          threadKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateErr(data.error ?? "Create failed.");
      } else {
        setCreated(true);
        setNewTitle("");
        setNewDue("");
      }
    } catch {
      setCreateErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function link(taskId: string) {
    setBusy(taskId);
    try {
      const res = await fetch("/api/tasks/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, linkedThreadKey: threadKey }),
      });
      if (res.ok) setLinkedId(taskId);
    } finally {
      setBusy(null);
    }
  }

  if (!tasks.length && !threadKey) return null;

  return (
    <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-fg"
      >
        <PlusGlyph />
        Add action from this thread
        <span className="ml-auto text-muted transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
          ›
        </span>
      </button>

      {open ? (
        <div className="mt-3">
          <div className="eyebrow mb-1.5 text-[10px] text-muted">Create a task from this thread</div>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createTask()}
              placeholder={customer ? `Task for ${customer}…` : "New task…"}
              className="input min-w-[180px] flex-1 px-2.5 py-1.5 text-sm"
            />
            <input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="input px-2 py-1.5 text-xs"
              title="Due date (optional)"
            />
            <button
              type="button"
              onClick={createTask}
              disabled={busy === "create" || !newTitle.trim()}
              className="btn-primary text-xs disabled:opacity-60"
            >
              {busy === "create" ? "Creating…" : created ? "Created ✓ Add another" : "Create task"}
            </button>
          </div>
          {createErr ? <p className="mb-2 text-2xs text-danger">{createErr}</p> : null}
          {created ? (
            <p className="mb-2 text-2xs text-muted">
              Task created and linked to this thread. Find it on the Tasks page.
            </p>
          ) : null}
          {tasks.length ? (
            <div className="eyebrow mb-1.5 text-[10px] text-muted">Or link an existing task</div>
          ) : null}
          <div className="space-y-1.5">
            {tasks.map((t) => {
              const linked = linkedId === t.id;
              return (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg">{t.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-2xs text-muted">
                      {t.customer ? <span>{t.customer}</span> : null}
                      {t.due ? <span>· due {t.due}</span> : null}
                      {t.priority ? <span>· {t.priority}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => link(t.id)}
                    disabled={linked || busy === t.id}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-2xs font-semibold ${
                      linked ? "text-ok" : "border border-border text-fg/70 hover:border-accent hover:text-accent"
                    }`}
                  >
                    {linked ? "Linked ✓" : busy === t.id ? "Linking…" : "Link"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-2xs text-muted">
            Linking connects this thread to the task so you can follow up (and
            send updates) in one place.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PlusGlyph() {
  return (
    <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
