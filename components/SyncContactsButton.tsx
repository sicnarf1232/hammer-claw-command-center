"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Phase B: resolve a meeting's attendees to contacts on its account, creating
// any missing customer contacts (one vault commit). Shown only when the meeting
// has an account assigned.
export default function SyncContactsButton({ notePath }: { notePath: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/meetings/sync-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notePath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not sync contacts.");
      } else if (data.added?.length) {
        setMsg(
          `Added ${data.added.length} to ${data.account}: ${data.added.join(", ")}`,
        );
        router.refresh();
      } else {
        setMsg("All attendees are already contacts.");
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={sync}
        disabled={busy}
        className="btn btn-ghost px-3 py-1 text-xs disabled:opacity-60"
        title="Resolve attendees to contacts on this account, creating missing ones"
      >
        {busy ? "Syncing…" : "Sync contacts"}
      </button>
      {msg && <p className="max-w-xs text-right text-2xs text-muted">{msg}</p>}
      {err && <p className="text-2xs text-danger">{err}</p>}
    </div>
  );
}
