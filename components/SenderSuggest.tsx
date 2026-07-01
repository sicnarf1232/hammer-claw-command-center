"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Shown on a thread whose external sender is not yet mapped to an account.
// Suggests the account (by shared email domain) and links on one tap, and offers
// a manual picker over all accounts when the suggestion is wrong or absent.
export default function SenderSuggest({
  address,
  name,
  suggestion,
  accounts,
}: {
  address: string;
  name: string | null;
  suggestion: { accountId: number; name: string } | null;
  accounts: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [pick, setPick] = useState("");

  async function link(accountId: number, accountName: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/inbox/link-sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, accountId, name }),
      });
      if (res.ok) {
        setDone(accountName);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const domain = address.split("@")[1]?.toLowerCase() ?? "";

  if (done) {
    return (
      <div className="mb-4 rounded-2xl border border-ok/40 bg-okSoft p-3 text-sm text-ok">
        Linked {domain ? `everyone @${domain}` : address} to {done}. Future mail maps
        automatically.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-warning/40 bg-warmSoft p-3">
      <div className="text-xs font-semibold text-fg">Unmapped sender</div>
      <div className="mt-0.5 text-xs text-fg/70">
        {name ? `${name} · ` : ""}
        {address} is not linked to an account yet.
        {domain ? ` Linking maps everyone @${domain}.` : ""}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {suggestion ? (
          <>
            <span className="text-xs text-muted">Looks like</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => link(suggestion.accountId, suggestion.name)}
              className="btn-primary text-xs"
            >
              Link to {suggestion.name}
            </button>
            <button
              type="button"
              onClick={() => setManual((m) => !m)}
              className="text-xs text-muted underline hover:text-fg"
            >
              Not right?
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setManual((m) => !m)}
            className="btn-outline text-xs"
          >
            Link to an account
          </button>
        )}
      </div>

      {manual ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="input py-1.5 text-xs"
          >
            <option value="">Choose account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !pick}
            onClick={() => {
              const a = accounts.find((x) => String(x.id) === pick);
              if (a) link(a.id, a.name);
            }}
            className="btn-primary text-xs"
          >
            Link
          </button>
        </div>
      ) : null}
    </div>
  );
}
