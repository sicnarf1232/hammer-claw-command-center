"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Quick-add row for /tasks (Phase 2, DB-first). Title required; optional due
// date and account. Created via /api/tasks/create; the vault copy is an
// export concern, not a side effect.
export default function QuickAddTask({
  accounts,
}: {
  accounts: string[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    const clean = title.trim();
    if (!clean || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: clean,
          due: due || undefined,
          customer: customer || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Create failed.");
      } else {
        setTitle("");
        setDue("");
        setCustomer("");
        router.refresh();
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a task…"
          className="input min-w-[220px] flex-1 px-3 py-1.5 text-sm"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="input px-2 py-1.5 text-xs"
          title="Due date (optional)"
        />
        <select
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          className="input px-2 py-1.5 text-xs"
          title="Account (optional)"
        >
          <option value="">No account</option>
          {accounts.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={busy || !title.trim()}
          className="btn-primary text-sm disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add task"}
        </button>
      </div>
      {err && <p className="mt-1.5 text-xs text-danger">{err}</p>}
    </div>
  );
}
