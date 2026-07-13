"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { todayISO } from "@/lib/dates";

// Manually file a meeting note, no Granola pull needed. The note lands in the
// database in the canonical format (TL;DR + Full Notes), so it renders,
// briefs, and exports like any pulled meeting.
export default function NewMeetingForm({
  accountNames = [],
}: {
  accountNames?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [account, setAccount] = useState("");
  const [attendees, setAttendees] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          date,
          account: account.trim() || undefined,
          attendees,
          body,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `Create failed (${res.status}).`);
      setOpen(false);
      setTitle("");
      setDate(todayISO());
      setAccount("");
      setAttendees("");
      setBody("");
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
          + New meeting note
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-4 p-4" style={{ borderLeft: "3px solid var(--accent)" }}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold text-fg">New meeting note</h3>
        <span className="text-xs text-muted">files straight to the database, exports with the vault</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Stryker QBR prep"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Customer account (optional)
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            list="new-meeting-accounts"
            placeholder="Leave blank for Internal"
            className="input mt-1 w-full"
            disabled={busy}
          />
          <datalist id="new-meeting-accounts">
            {accountNames.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className="text-xs font-semibold text-muted">
          Attendees (comma separated)
          <input
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="Alice Smith, Bob Jones"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted sm:col-span-2">
          Notes (lands under Full Notes; the first line becomes the TL;DR)
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="What happened, decisions, follow-ups..."
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={create}
          disabled={busy || !title.trim()}
          className="btn btn-primary px-3 py-1.5 text-xs"
        >
          {busy ? "Filing…" : "File note"}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
