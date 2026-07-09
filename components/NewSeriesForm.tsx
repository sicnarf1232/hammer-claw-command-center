"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CADENCES = ["Weekly", "Biweekly", "Monthly", "Ad hoc"];

// Set up a rolling series by hand, before any meetings exist. The keywords and
// attendees become the series' match rules, so future Granola pulls link
// matching meetings to it automatically.
export default function NewSeriesForm({
  accountNames = [],
}: {
  accountNames?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState("Weekly");
  const [account, setAccount] = useState("");
  const [participants, setParticipants] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const canCreate =
    !!name.trim() && (split(participants).length > 0 || split(keywords).length > 0);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/series/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          accountName: account.trim() || undefined,
          cadence: cadence.toLowerCase(),
          participants: split(participants),
          keywords: split(keywords),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !data.path) throw new Error(data.error || `Create failed (${res.status}).`);
      setOpen(false);
      setName("");
      setAccount("");
      setParticipants("");
      setKeywords("");
      setBusy(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)} className="btn btn-ghost px-3 py-1.5 text-xs">
          + New series
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-4 p-4" style={{ borderLeft: "3px solid var(--accent)" }}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold text-fg">New series</h3>
        <span className="text-xs text-muted">future pulled meetings that match will link here</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted">
          Series name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stryker Weekly Sync"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Cadence
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            className="input mt-1 w-full"
            disabled={busy}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted sm:col-span-2">
          Customer account (optional, drives folder placement)
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            list="new-series-accounts"
            placeholder="Leave blank for Internal"
            className="input mt-1 w-full"
            disabled={busy}
          />
          <datalist id="new-series-accounts">
            {accountNames.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className="text-xs font-semibold text-muted">
          Key attendees (comma separated)
          <input
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            placeholder="Alice Smith, Bob Jones"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Title keywords (comma separated)
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="stryker, weekly sync"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={create} disabled={busy || !canCreate} className="btn btn-primary px-3 py-1.5 text-xs">
          {busy ? "Creating…" : "Create series"}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
