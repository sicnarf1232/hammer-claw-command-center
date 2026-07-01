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
  reviewed: boolean;
}

export interface Folder {
  key: string;
  label: string;
  group: "top" | "pathway";
  count: number;
}

const PATHWAY: Record<string, { label: string; color: string }> = {
  "needs-reply": { label: "Needs reply", color: "var(--due)" },
  "quote-request": { label: "Quote", color: "var(--accent)" },
  "quality-pcn": { label: "Quality / PCN", color: "var(--warm)" },
  logistics: { label: "Logistics", color: "var(--info, #5145e6)" },
  fyi: { label: "FYI", color: "var(--ink-3)" },
  noise: { label: "Noise", color: "var(--ink-3)" },
};

function href(key: string): string {
  return key === "attention" ? "/inbox" : `/inbox?folder=${key}`;
}

export default function InboxList({
  threads,
  folder,
  folders,
}: {
  threads: InboxThread[];
  folder: string;
  folders: Folder[];
}) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const requested = useRef<Set<string>>(new Set());
  const [triaging, setTriaging] = useState(false);

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
  const top = folders.filter((f) => f.group === "top");
  const pathways = folders.filter((f) => f.group === "pathway");

  return (
    <div className="flex gap-5">
      {/* Desktop folder rail */}
      <aside className="hidden w-44 shrink-0 md:block">
        <nav className="space-y-0.5">
          {top.map((f) => (
            <FolderLink key={f.key} f={f} active={f.key === folder} />
          ))}
        </nav>
        <div className="mb-1.5 mt-4 px-2 text-2xs font-extrabold uppercase tracking-[0.14em] text-muted">
          Pathways
        </div>
        <nav className="space-y-0.5">
          {pathways.map((f) => (
            <FolderLink key={f.key} f={f} active={f.key === folder} dot />
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile folder chips */}
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 md:hidden">
          {folders.map((f) => (
            <Link
              key={f.key}
              href={href(f.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
                f.key === folder
                  ? "border-transparent bg-primary text-primary-fg"
                  : "border-border bg-surface text-fg/70"
              }`}
            >
              {f.label}
              <span className={f.key === folder ? "text-primary-fg/80" : "text-muted"}>{f.count}</span>
            </Link>
          ))}
        </div>

        <div className="relative mb-4 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search mail…"
            className="input w-full pl-9"
            inputMode="search"
          />
        </div>

        {triaging ? (
          <div className="mb-3 flex items-center gap-2 px-1 text-2xs font-medium text-accent">
            <SparkGlyph className="h-3.5 w-3.5 animate-pulse" />
            AI is reading your mail…
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState folder={folder} searching={q.trim().length > 0} />
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
    </div>
  );
}

function FolderLink({ f, active, dot }: { f: Folder; active: boolean; dot?: boolean }) {
  const color = dot ? PATHWAY[f.key]?.color : undefined;
  return (
    <Link
      href={href(f.key)}
      className={`flex items-center justify-between rounded-[10px] px-2.5 py-1.5 text-sm transition-colors ${
        active ? "bg-accentSoft font-semibold text-accent" : "text-fg/75 hover:bg-surface2"
      }`}
    >
      <span className="flex items-center gap-2 truncate">
        {dot ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color ?? "var(--ink-3)" }} />
        ) : null}
        {f.label}
      </span>
      {f.count > 0 ? (
        <span className={`shrink-0 text-2xs tabular-nums ${active ? "text-accent" : "text-muted"}`}>
          {f.count}
        </span>
      ) : null}
    </Link>
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
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--due)" }} />
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
          {t.reviewed ? <span className="chip border-ok/40 text-ok">✓ Reviewed</span> : null}
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

function EmptyState({ folder, searching }: { folder: string; searching: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accentSoft text-accent">
        <SparkGlyph className="h-6 w-6" />
      </div>
      <div className="text-sm font-semibold text-fg">
        {searching ? "No matches" : folder === "attention" ? "You're all caught up" : "Nothing here yet"}
      </div>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        {searching
          ? "Try a different search."
          : folder === "attention"
            ? "Flagged mail, unmapped senders, and anything the AI says needs a reply surface here."
            : "Mail lands in this folder as it arrives and gets triaged."}
      </p>
    </div>
  );
}

function withAlpha(color: string): string {
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
