"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Edit a person: internal team vs customer, and (for customers) which account.
// Writes an authoritative roster override that then drives colors, contact
// grouping, and company labels everywhere.
export default function PersonClassifier({
  name,
  classification,
  account,
  accounts,
}: {
  name: string;
  classification: "merit" | "customer" | null;
  account?: string;
  accounts: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [side, setSide] = useState<"merit" | "customer">(classification ?? "merit");
  const [acct, setAcct] = useState(account ?? accounts[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/people/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          classification: side,
          account: side === "customer" ? acct : null,
        }),
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

  const label =
    classification === "merit"
      ? "Internal team"
      : classification === "customer"
        ? `Customer${account ? ` · ${account}` : ""}`
        : "Unclassified";

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="chip transition-colors hover:border-[color:var(--accent)]"
        style={{ borderColor: "var(--line-2)" }}
        title="Set whether this person is internal or a customer contact"
      >
        <span className="font-medium text-fg">{label}</span>
        <span style={{ color: "var(--accent)" }}>edit</span>
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select
        value={side}
        onChange={(e) => setSide(e.target.value as "merit" | "customer")}
        disabled={busy}
        className="input py-1 text-xs"
      >
        <option value="merit">Internal team</option>
        <option value="customer">Customer contact</option>
      </select>
      {side === "customer" && (
        <select
          value={acct}
          onChange={(e) => setAcct(e.target.value)}
          disabled={busy}
          className="input py-1 text-xs"
        >
          <option value="">(no account)</option>
          {accounts.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}
      <button onClick={save} disabled={busy} className="btn btn-primary px-2.5 py-1 text-xs">
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => {
          setEditing(false);
          setSide(classification ?? "merit");
          setAcct(account ?? accounts[0] ?? "");
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
