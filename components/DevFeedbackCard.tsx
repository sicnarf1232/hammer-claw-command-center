"use client";

import { useEffect, useState } from "react";

// The dev feedback bucket: notes Jordan drops from anywhere via the brain's
// /devfeedback command. Listed here so nothing gets lost; items get marked
// done as they ship in build sessions.

interface Item {
  id: number;
  text: string;
  page: string | null;
  status: string;
  createdAtISO: string | null;
}

export default function DevFeedbackCard() {
  const [items, setItems] = useState<Item[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/feedback");
      const data = await res.json();
      if (res.ok) setItems(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: number, status: "open" | "done") {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).catch(() => {});
  }

  const open = items.filter((i) => i.status === "open");
  const done = items.filter((i) => i.status === "done");

  return (
    <section className="card mt-6 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="eyebrow text-muted">Dev feedback bucket</div>
          <p className="mt-0.5 text-xs text-muted">
            Notes dropped via /devfeedback in the brain, from any page. Drained
            during build sessions.
          </p>
        </div>
        <span className="rounded-full bg-accentSoft px-2 py-0.5 text-2xs font-bold tabular-nums text-accent">
          {open.length} open
        </span>
      </div>

      {!loaded ? (
        <p className="mt-3 text-xs text-muted">Loading…</p>
      ) : open.length === 0 ? (
        <p className="mt-3 text-xs text-muted">Bucket is empty. Nice.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {open.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="whitespace-pre-wrap text-fg/85">{i.text}</div>
                <div className="mt-0.5 text-2xs text-muted">
                  {i.page ?? ""}
                  {i.createdAtISO
                    ? ` · ${new Date(i.createdAtISO).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatus(i.id, "done")}
                className="shrink-0 rounded-lg border border-border px-2 py-0.5 text-2xs text-fg/70 hover:border-accent hover:text-accent"
              >
                Done
              </button>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 ? (
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            className="text-2xs text-muted hover:text-fg"
          >
            {showDone ? "Hide" : "Show"} {done.length} done
          </button>
          {showDone ? (
            <ul className="mt-2 space-y-1">
              {done.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 text-2xs text-muted">
                  <span className="line-through">{i.text}</span>
                  <button
                    type="button"
                    onClick={() => setStatus(i.id, "open")}
                    className="shrink-0 hover:text-fg"
                  >
                    Reopen
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
