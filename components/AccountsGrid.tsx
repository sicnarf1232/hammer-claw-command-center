"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AccountWithStats } from "@/lib/accounts";
import { SearchIcon } from "./icons";

export default function AccountsGrid({
  accounts,
}: {
  accounts: AccountWithStats[];
}) {
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts.filter((a) => {
      if (openOnly && a.openTaskCount === 0) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        (a.region ?? "").toLowerCase().includes(needle) ||
        (a.accountNumber ?? "").toLowerCase().includes(needle)
      );
    });
  }, [accounts, q, openOnly]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search accounts…"
            className="input w-64 pl-8"
          />
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-[rgb(var(--c-primary))]"
          />
          With open tasks
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <Link
            key={a.slug}
            href={`/accounts/${a.slug}`}
            className="card group flex flex-col gap-3 p-4 transition-shadow hover:shadow-elevated"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold text-fg group-hover:text-primary">
                  {a.name}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {[a.type, a.region].filter(Boolean).join(" · ") || "Account"}
                </div>
              </div>
              {a.accountNumber ? (
                <span className="chip shrink-0 border-border bg-surface2 font-mono text-muted">
                  #{a.accountNumber}
                </span>
              ) : (
                <span className="shrink-0 text-2xs text-muted/60">no number</span>
              )}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-1.5">
              {a.openTaskCount > 0 ? (
                <span className="chip border-primary/20 bg-primary/10 text-primary">
                  {a.openTaskCount} open
                </span>
              ) : (
                <span className="chip border-border bg-surface2 text-muted">
                  clear
                </span>
              )}
              {a.overdueCount > 0 && (
                <span className="chip border-danger/25 bg-danger/10 text-danger">
                  {a.overdueCount} overdue
                </span>
              )}
              {a.nextDue && a.overdueCount === 0 && (
                <span className="text-2xs text-muted">
                  next due{" "}
                  <span className="font-mono tabular-nums">{a.nextDue}</span>
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-sm font-medium text-fg">No accounts match</div>
          <p className="mt-1 text-sm text-muted">Try a different search.</p>
        </div>
      )}
    </div>
  );
}
