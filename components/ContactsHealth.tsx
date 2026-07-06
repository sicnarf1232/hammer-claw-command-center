"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { customerHue, initials } from "@/lib/customerHues";
import type { ContactsHealth, PersonHealth } from "@/lib/contactsHealth";
import { SearchIcon } from "./icons";

function agoLabel(days: number | null): string {
  if (days == null) return "No email yet";
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const mo = Math.round(days / 30);
  return `${mo}mo ago`;
}

export default function ContactsHealthView({ data }: { data: ContactsHealth }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data.people;
    return data.people.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.accountName.toLowerCase().includes(needle) ||
        (p.title ?? "").toLowerCase().includes(needle),
    );
  }, [q, data.people]);

  // Group filtered people by account for the "By account" sections.
  const byAccount = useMemo(() => {
    const m = new Map<string, { name: string; slug: string; people: PersonHealth[] }>();
    for (const p of filtered) {
      let g = m.get(p.accountSlug);
      if (!g) {
        g = { name: p.accountName, slug: p.accountSlug, people: [] };
        m.set(p.accountSlug, g);
      }
      g.people.push(p);
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const attention = q.trim() ? [] : data.needsAttention;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      {/* Main */}
      <div className="min-w-0">
        <div className="relative mb-5 sm:max-w-md">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people across all accounts…"
            className="input w-full pl-9"
          />
        </div>

        {attention.length > 0 ? (
          <section className="mb-6">
            <div className="eyebrow mb-2 px-1 text-[10px] text-due">Needs attention</div>
            <div className="overflow-hidden rounded-2xl border border-due/30 bg-surface">
              {attention.map((p, i) => (
                <PersonRow key={`${p.accountSlug}-${p.name}-${i}`} p={p} first={i === 0} />
              ))}
            </div>
          </section>
        ) : null}

        {byAccount.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">No people match.</div>
        ) : (
          <div className="space-y-5">
            {byAccount.map((g) => {
              const hue = customerHue(g.name);
              return (
                <section key={g.slug}>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: hue.hue }} />
                    <h2 className="text-sm font-bold text-fg">{g.name}</h2>
                    <span className="chip border-border bg-surface2 text-muted">{g.people.length}</span>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                    {g.people.map((p, i) => (
                      <PersonRow key={`${p.name}-${i}`} p={p} first={i === 0} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Right rail */}
      <aside className="space-y-4">
        <div>
          <div className="eyebrow mb-2 px-1 text-[10px] text-muted">Primary contacts by account</div>
          <div className="space-y-1">
            {data.accounts.slice(0, 20).map((a) => {
              const hue = customerHue(a.name);
              return (
                <Link
                  key={a.slug}
                  href={`/accounts/${a.slug}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface2"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: hue.hue }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-fg">{a.name}</div>
                    <div className="truncate text-2xs text-muted">
                      {a.primaryContact ?? "No primary contact"}
                    </div>
                  </div>
                  {a.pendingReply ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--due)" }} title="Awaiting reply" />
                  ) : null}
                  <span className="shrink-0 text-2xs tabular-nums text-muted">{agoLabel(a.daysSince)}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface2 px-3 py-2.5 text-2xs leading-relaxed text-muted">
          Full contact profiles, email history, and tasks live inside each Account. This view is
          relationship health at a glance.
        </div>
      </aside>
    </div>
  );
}

function PersonRow({ p, first }: { p: PersonHealth; first: boolean }) {
  const hue = customerHue(p.accountColorKey);
  return (
    <Link
      href={`/people/${encodeURIComponent(p.name)}`}
      className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface2 ${first ? "" : "border-t border-border"}`}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white"
        style={{ background: hue.hue }}
      >
        {initials(p.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg">{p.name}</span>
          {p.pendingReply ? (
            <span className="chip shrink-0 border-due/30 bg-due/10 text-due">awaiting reply</span>
          ) : p.goneQuiet ? (
            <span className="chip shrink-0 border-warm/30 text-warm" style={{ background: "var(--warm-soft)" }}>
              gone quiet
            </span>
          ) : null}
        </div>
        <div className="truncate text-2xs text-muted">
          {[p.title, p.accountName].filter(Boolean).join(" · ")}
        </div>
      </div>
      <span className="shrink-0 text-2xs tabular-nums text-muted">{agoLabel(p.daysSince)}</span>
    </Link>
  );
}
