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

const NEW_ACCOUNT = "__new__";

// Who-is-who confirm queue (DB-CUTOVER stage 3): people the import or the
// inbox could not confidently place. Each resolution is stated back to the
// user (classified people leave the queue but live on their profile page and
// in their account's contact list).
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
  const [done, setDone] = useState<string | null>(null);
  const [accountPick, setAccountPick] = useState<Record<number, string>>({});
  const [newName, setNewName] = useState<Record<number, string>>({});

  if (!people.length && !done) return null;

  async function resolve(
    p: ReviewPersonItem,
    body: Record<string, unknown>,
    describe: string,
  ) {
    setBusy(p.id);
    setErr(null);
    try {
      const res = await fetch("/api/people/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "Failed.");
      } else {
        setDone(`${p.fullName}: ${describe}`);
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
        <span className="eyebrow text-muted">People to sort out</span>
        {people.length > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-fg">
            {people.length}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">
        The import and inbox could not confidently place these people. For each
        one: <span className="text-fg/80">Merit teammate</span> marks them as
        internal Merit staff (they leave this list and show as team everywhere).
        Picking a <span className="text-fg/80">customer account</span> files
        them as that customer&apos;s contact.{" "}
        <span className="text-fg/80">Not sure</span> just clears the flag and
        changes nothing. Sorted people are not deleted: find anyone on their
        profile page (search their name) or on the account they belong to.
      </p>
      {done && (
        <p className="mb-2 rounded-lg border border-border bg-surface2 px-3 py-2 text-xs text-fg/80">
          ✓ {done}
        </p>
      )}
      {err && <p className="mb-2 text-xs text-danger">{err}</p>}
      <ul className="space-y-2">
        {people.map((p) => {
          const pick = accountPick[p.id] ?? "";
          const isNew = pick === NEW_ACCOUNT;
          const pickedName = isNew
            ? (newName[p.id] ?? "").trim()
            : accounts.find((a) => String(a.id) === pick)?.name ?? "";
          return (
            <li
              key={p.id}
              className="rounded-lg border border-border px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg">{p.fullName}</div>
                  <div className="truncate text-2xs text-muted">
                    {[p.title, p.email].filter(Boolean).join(" · ") || "no details captured"}
                    {p.accountName ? ` · currently linked to ${p.accountName}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() =>
                      resolve(p, { classification: "internal" }, "marked as a Merit teammate")
                    }
                    className="btn-outline text-xs disabled:opacity-60"
                    title="Internal Merit staff, not a customer contact"
                  >
                    Merit teammate
                  </button>
                  <select
                    className="input px-1.5 py-1 text-xs"
                    value={pick}
                    onChange={(e) =>
                      setAccountPick((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                    title="File as a customer contact of this account"
                  >
                    <option value="">Customer contact of…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.name}
                      </option>
                    ))}
                    <option value={NEW_ACCOUNT}>+ New account…</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy === p.id || !pick || (isNew && !pickedName)}
                    onClick={() =>
                      resolve(
                        p,
                        isNew
                          ? { classification: "customer", newAccountName: pickedName }
                          : { classification: "customer", accountId: Number(pick) },
                        `filed as a contact of ${pickedName}${isNew ? " (new account created)" : ""}`,
                      )
                    }
                    className="btn-primary text-xs disabled:opacity-60"
                  >
                    File contact
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() =>
                      resolve(p, { dismiss: true }, "left as-is (flag cleared)")
                    }
                    className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg"
                    title="Skip: keep them unclassified and clear the flag"
                  >
                    Not sure
                  </button>
                </div>
              </div>
              {isNew && (
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    value={newName[p.id] ?? ""}
                    onChange={(e) =>
                      setNewName((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                    placeholder="New account name…"
                    className="input flex-1 px-2.5 py-1.5 text-xs"
                  />
                  <span className="text-2xs text-muted">
                    Creates the account, then files {p.fullName} under it.
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
