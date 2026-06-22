"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Inline link/internal control on a meeting note. Shows the current state and
// lets the user link an account or mark the note internal, writing just the
// customer frontmatter line. Fixes the common "internal discussion about a
// customer got parsed as a customer meeting" mixup.
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
  const [choice, setChoice] = useState(current ?? "__internal__");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const account = choice === "__internal__" ? null : choice;
    try {
      const res = await fetch("/api/meetings/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, account }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Failed (${res.status}).`);
      setEditing(false);
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
        title="Change whether this is an internal or customer meeting"
      >
        <span className="text-muted">{current ? "Customer:" : "Internal"}</span>
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
        <option value="__internal__">Internal (no account)</option>
        {accounts.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <button onClick={save} disabled={busy} className="btn btn-primary px-2.5 py-1 text-xs">
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => {
          setEditing(false);
          setChoice(current ?? "__internal__");
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
