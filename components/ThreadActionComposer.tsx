"use client";

import { useState } from "react";

export interface LinkableTask {
  id: string;
  title: string;
  customer: string | null;
  due: string | null;
  priority: string | null;
}

// "Add action from this thread" (Backlog D). Links this email thread to an
// existing open task via task_meta.linkedThreadKey, so the task's card can reply
// in-thread and track the customer conversation. Creating a brand-new task is
// deferred to the vault-writeback path (see PUNCHLIST).
export default function ThreadActionComposer({
  threadKey,
  tasks,
}: {
  threadKey: string;
  tasks: LinkableTask[];
}) {
  const [open, setOpen] = useState(false);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  if (!tasks.length) return null;

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
          <div className="eyebrow mb-1.5 text-[10px] text-muted">Link to an existing task</div>
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
            Linking connects this thread to the task so you can follow up in one place. New-task
            creation writes to the vault and is coming next.
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
