"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ReviewPersonItem {
  id: number;
  fullName: string;
  classification: string;
  accountName: string | null;
  email: string | null;
  title: string | null;
}

// Who-is-who confirm queue (DB-CUTOVER stage 3): people the seed or firehose
// flagged as ambiguous. One tap classifies (Merit / customer + account) or
// dismisses the flag.
export default function PeopleReviewQueue({
  people,
  accounts,
}: {
  people: ReviewPersonItem[];
  accounts: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [accountPick, setAccountPick] = useState<Record<number, number>>({});

  if (!people.length) return null;

  async function resolve(id: number, body: Record<string, unknown>) {
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch("/api/people/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "Failed.");
      } else {
        router.refresh();
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card mb-5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="eyebrow text-muted">Confirm who this is</span>
        <span className="rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-fg">
          {people.length}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted">
        Ambiguous or unmapped people from the vault import and inbox. Classify
        them once and every view follows.
      </p>
      {err && <p className="mb-2 text-xs text-danger">{err}</p>}
      <ul className="space-y-2">
        {people.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-fg">{p.fullName}</div>
              <div className="truncate text-2xs text-muted">
                {[p.title, p.email, p.accountName].filter(Boolean).join(" · ") ||
                  `currently ${p.classification}`}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={busy === p.id}
                onClick={() => resolve(p.id, { classification: "internal" })}
                className="btn-outline text-xs disabled:opacity-60"
              >
                Merit
              </button>
              <select
                className="input px-1.5 py-1 text-xs"
                value={accountPick[p.id] ?? ""}
                onChange={(e) =>
                  setAccountPick((s) => ({ ...s, [p.id]: Number(e.target.value) }))
                }
              >
                <option value="">Customer of…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy === p.id || !accountPick[p.id]}
                onClick={() =>
                  resolve(p.id, {
                    classification: "customer",
                    accountId: accountPick[p.id],
                  })
                }
                className="btn-primary text-xs disabled:opacity-60"
              >
                Set
              </button>
              <button
                type="button"
                disabled={busy === p.id}
                onClick={() => resolve(p.id, { dismiss: true })}
                className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg"
                title="Leave as is; just clear the flag"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
