"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Inline link/internal control on a meeting note. Links an account (existing or
// brand-new), or marks the note internal. The write propagates fully (folder
// move + title + index), so the change follows everywhere. Fixes the "internal
// discussion about a customer got parsed as a customer meeting" mixup.
const INTERNAL = "__internal__";
const CREATE = "__create__";

export default function MeetingClassifier({
  path,
  current,
  accounts,
}: {
  path: string;
  current: string | null; // current linked account display, or null = internal
  accounts: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(current ?? INTERNAL);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const creating = choice === CREATE;
    const account = creating
      ? newName.trim()
      : choice === INTERNAL
        ? null
        : choice;
    if (creating && !account) {
      setErr("Enter a name for the new account.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/meetings/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, account, create: creating }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        path?: string;
        accountSlug?: string;
      };
      if (!res.ok) throw new Error(data.error || `Failed (${res.status}).`);
      setEditing(false);
      if (data.accountSlug) {
        // New account: drop the user on it to fill in details.
        router.push(`/accounts/${data.accountSlug}`);
      } else if (data.path && data.path !== path) {
        // The note moved folders; follow it to its new path.
        router.push(`/meetings?note=${encodeURIComponent(data.path)}`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="chip transition-colors hover:border-[color:var(--accent)]"
        style={{ borderColor: "var(--line-2)" }}
        title="Link an account, create one, or mark this meeting internal"
      >
        <span className="text-muted">{current ? "Customer:" : "Internal · Merit"}</span>
        {current && <span className="font-medium text-fg">{current}</span>}
        <span style={{ color: "var(--accent)" }}>edit</span>
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        disabled={busy}
        className="input py-1 text-xs"
      >
        <option value={INTERNAL}>Internal (no account)</option>
        {accounts.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
        <option value={CREATE}>＋ Create new account…</option>
      </select>
      {choice === CREATE && (
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New account name"
          disabled={busy}
          className="input py-1 text-xs"
        />
      )}
      <button onClick={save} disabled={busy} className="btn btn-primary px-2.5 py-1 text-xs">
        {busy ? "Saving…" : choice === CREATE ? "Create & link" : "Save"}
      </button>
      <button
        onClick={() => {
          setEditing(false);
          setChoice(current ?? INTERNAL);
          setNewName("");
        }}
        disabled={busy}
        className="btn btn-ghost px-2.5 py-1 text-xs"
      >
        Cancel
      </button>
      {err && <span className="text-2xs text-danger">{err}</span>}
    </span>
  );
}
