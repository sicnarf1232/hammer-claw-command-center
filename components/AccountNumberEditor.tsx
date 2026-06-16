"use client";

import { useState } from "react";

// Inline editor for an account's number. Writes back to the customer note's
// frontmatter via /api/accounts/number (the vault stays the source of truth).
export default function AccountNumberEditor({
  path,
  initial,
}: {
  path: string;
  initial?: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/accounts/number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, accountNumber: draft.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not save.");
      } else {
        setValue(draft.trim());
        setEditing(false);
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Account number"
            autoFocus
            className="input w-40 font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setDraft(value);
                setEditing(false);
              }
            }}
          />
          <button
            onClick={save}
            disabled={busy}
            className="btn btn-primary px-2.5 py-1 text-xs"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
            className="btn btn-ghost px-2 py-1 text-xs"
          >
            Cancel
          </button>
        </div>
        {err && <p className="text-2xs text-danger">{err}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="group flex items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-1.5 text-sm transition-colors hover:border-primary/40"
      title="Edit account number"
    >
      <span className="text-2xs uppercase tracking-wide text-muted">Acct #</span>
      {value ? (
        <span className="font-mono tabular-nums text-fg">{value}</span>
      ) : (
        <span className="text-muted group-hover:text-primary">add</span>
      )}
    </button>
  );
}
