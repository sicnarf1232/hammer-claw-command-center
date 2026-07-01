"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Shown on a thread whose sender is not yet mapped to an account. Suggests the
// account (by shared email domain) and links on one tap. Suggestion-only.
export default function SenderSuggest({
  address,
  name,
  suggestion,
}: {
  address: string;
  name: string | null;
  suggestion: { accountId: number; name: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

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

  if (done) {
    return (
      <div className="mb-4 rounded-2xl border border-ok/40 bg-okSoft p-3 text-sm text-ok">
        Linked {address} to {done}.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-warning/40 bg-warmSoft p-3">
      <div className="text-xs font-semibold text-fg">Unmapped sender</div>
      <div className="mt-0.5 text-xs text-fg/70">
        {name ? `${name} · ` : ""}
        {address} is not linked to an account yet.
      </div>
      {suggestion ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Looks like</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => link(suggestion.accountId, suggestion.name)}
            className="btn-primary text-xs"
          >
            Link to {suggestion.name}
          </button>
        </div>
      ) : (
        <div className="mt-1 text-xs text-muted">
          No matching account found by domain. Map it from the account page when ready.
        </div>
      )}
    </div>
  );
}
