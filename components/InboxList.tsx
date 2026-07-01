"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { customerHue, initials } from "@/lib/customerHues";

export interface InboxThread {
  key: string;
  subject: string;
  preview: string | null;
  lastAtISO: string | null;
  count: number;
  inbound: number;
  outbound: number;
  lastDirection: "inbound" | "outbound";
  who: string;
  accountName: string | null;
  accountSlug: string | null;
  needsReview: boolean;
  hasAttachments: boolean;
  flagged: boolean;
  replied: boolean;
  unread: boolean;
  summary: string | null;
  pathway: string | null;
  priority: string | null;
  needsReply: boolean;
}

type View = "attention" | "flagged" | "all";

const TABS: { key: View; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "flagged", label: "Flagged" },
  { key: "all", label: "All" },
];

// Client-safe pathway chip metadata (mirrors lib/firehose/triage PATHWAY_META).
const PATHWAY: Record<string, { label: string; color: string }> = {
  "needs-reply": { label: "Needs reply", color: "var(--due)" },
  "quote-request": { label: "Quote", color: "var(--accent)" },
  "quality-pcn": { label: "Quality / PCN", color: "var(--warm)" },
  logistics: { label: "Logistics", color: "var(--info, #5145e6)" },
  fyi: { label: "FYI", color: "var(--ink-3)" },
  noise: { label: "Noise", color: "var(--ink-3)" },
};

export default function InboxList({
  threads,
  view,
  counts,
}: {
  threads: InboxThread[];
  view: View;
  counts: { attention: number; flagged: number; all: number };
}) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const requested = useRef<Set<string>>(new Set());
  const [triaging, setTriaging] = useState(false);

  // Progressively AI-triage untriaged threads, 6 at a time, then refresh so the
  // summaries + smart "Needs attention" membership show up. Each key is only
  // requested once (no retry loops).
  useEffect(() => {
    const pending = threads
      .filter((t) => !t.summary && !requested.current.has(t.key))
      .slice(0, 6)
      .map((t) => t.key);
    if (pending.length === 0) return;
    pending.forEach((k) => requested.current.add(k));
    let cancelled = false;
    setTriaging(true);
    (async () => {
      try {
        const res = await fetch("/api/inbox/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: pending }),
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data?.triagedCount > 0) router.refresh();
      } finally {
        if (!cancelled) setTriaging(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threads, router]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((t) =>
      [t.subject, t.who, t.preview, t.summary, t.accountName]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(needle)),
    );
  }, [q, threads]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search mail…"
            className="input w-full pl-9"
            inputMode="search"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {TABS.map((tab) => {
            const active = tab.key === view;
            return (
              <Link
                key={tab.key}
                href={tab.key === "attention" ? "/inbox" : `/inbox?view=${tab.key}`}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-transparent bg-primary text-primary-fg"
                    : "border-border bg-surface text-fg/70 hover:text-fg"
                }`}
              >
                {tab.label}
                <span className={active ? "text-primary-fg/80" : "text-muted"}>
                  {counts[tab.key]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {triaging ? (
        <div className="mb-3 flex items-center gap-2 px-1 text-2xs font-medium text-accent">
          <SparkGlyph className="h-3.5 w-3.5 animate-pulse" />
          AI is reading your mail…
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState view={view} searching={q.trim().length > 0} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="mb-2 px-1 text-2xs font-extrabold uppercase tracking-[0.14em] text-muted">
                {g.label}
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {g.items.map((t, i) => (
                  <Row key={t.key} t={t} first={i === 0} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ t, first }: { t: InboxThread; first: boolean }) {
  const hue = customerHue(t.accountName || t.who);
  const outbound = t.lastDirection === "outbound";
  const path = t.pathway ? PATHWAY[t.pathway] : null;
  const high = t.priority === "high";
  return (
    <Link
      href={`/inbox/${encodeURIComponent(t.key)}`}
      className={`group relative flex gap-3 px-3 py-3 transition-colors hover:bg-surface2 sm:px-4 ${
        first ? "" : "border-t border-border"
      }`}
    >
      {t.flagged || high ? (
        <span
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: high ? "var(--due)" : "var(--due)" }}
        />
      ) : null}

      <div
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: hue.hue }}
      >
        {initials(t.who)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {t.unread ? (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
            ) : null}
            <span className={`truncate text-sm ${t.unread ? "font-bold text-fg" : "font-semibold text-fg/90"}`}>
              {t.who}
            </span>
            {t.count > 1 ? (
              <span className="shrink-0 rounded-full bg-surface2 px-1.5 text-2xs font-semibold tabular-nums text-fg/60">
                {t.count}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 text-2xs tabular-nums text-muted">{rel(t.lastAtISO)}</span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          {outbound ? <SentGlyph /> : null}
          <span className={`truncate text-sm ${t.unread ? "font-semibold text-fg/90" : "text-fg/75"}`}>
            {t.subject}
          </span>
        </div>

        {/* AI summary when available, else the raw snippet */}
        {t.summary ? (
          <div className="mt-1 flex items-start gap-1.5">
            <SparkGlyph className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
            <span className="line-clamp-2 text-xs text-fg/70">{t.summary}</span>
          </div>
        ) : t.preview ? (
          <div className="mt-0.5 truncate text-xs text-muted">{t.preview}</div>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {high ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold text-dueInk" style={{ background: "var(--due-soft)" }}>
              High
            </span>
          ) : null}
          {path ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold"
              style={{ background: withAlpha(path.color), color: path.color }}
            >
              {path.label}
            </span>
          ) : null}
          {t.accountName ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold"
              style={{ background: hue.soft, color: hue.hue }}
            >
              {t.accountName}
            </span>
          ) : t.needsReview ? (
            <span className="chip border-warning/40 text-warning">Needs review</span>
          ) : null}
          {t.replied ? <span className="chip border-ok/40 text-ok">Replied</span> : null}
          {t.hasAttachments ? (
            <span className="chip border-border text-fg/55">
              <ClipIcon /> Attachment
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ view, searching }: { view: View; searching: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accentSoft text-accent">
        <SparkGlyph className="h-6 w-6" />
      </div>
      <div className="text-sm font-semibold text-fg">
        {searching ? "No matches" : view === "all" ? "No mail yet" : "You're all caught up"}
      </div>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        {searching
          ? "Try a different search."
          : view === "all"
            ? "Once the firehose flows fire, every Merit OEM message lands here, threaded and triaged."
            : "Flagged mail, unmapped senders, and anything the AI says needs a reply surface here."}
      </p>
    </div>
  );
}

function withAlpha(color: string): string {
  // token colors are hex or var(); for var() fall back to a soft surface tint.
  return color.startsWith("#") ? `${color}1f` : "var(--surface-2)";
}

function groupByDate(items: InboxThread[]): { label: string; items: InboxThread[] }[] {
  const buckets: Record<string, InboxThread[]> = {};
  const order: string[] = [];
  for (const t of items) {
    const label = bucketLabel(t.lastAtISO);
    if (!buckets[label]) {
      buckets[label] = [];
      order.push(label);
    }
    buckets[label].push(t);
  }
  return order.map((label) => ({ label, items: buckets[label] }));
}

function bucketLabel(iso: string | null): string {
  if (!iso) return "Older";
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Earlier this week";
  if (days <= 30) return "Earlier this month";
  return "Older";
}

function rel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function SentGlyph() {
  return (
    <svg className="h-3 w-3 shrink-0 text-accent2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7M17 7H8M17 7v9" />
    </svg>
  );
}
function ClipIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
    </svg>
  );
}
function SparkGlyph({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4"} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.9 5.6a2 2 0 0 0 1.3 1.3L21 11l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 11l5.8-1.9a2 2 0 0 0 1.3-1.3z" />
    </svg>
  );
}
