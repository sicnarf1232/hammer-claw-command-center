"use client";

import Link from "next/link";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { customerHue, initials } from "@/lib/customerHues";
import ThreadDetail from "@/components/ThreadDetail";

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
  // The most urgent open task linked to this thread: the "why this matters".
  linkedTask: { taskId: string; title: string; due: string | null; overdue: boolean } | null;
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

export default function InboxWorkspace(props: {
  threads: InboxThread[];
  folder: string;
  folders: Folder[];
}) {
  return (
    <Suspense fallback={null}>
      <Workspace {...props} />
    </Suspense>
  );
}

function Workspace({
  threads,
  folder,
  folders,
}: {
  threads: InboxThread[];
  folder: string;
  folders: Folder[];
}) {
  const searchParams = useSearchParams();
  const [selectedKey, setSelectedKey] = useState<string | null>(
    () => searchParams.get("selected"),
  );

  // Selection is panel state, not navigation: mirror it into the URL so a
  // reload or shared link reopens the same thread, but never router.push.
  const select = useCallback((key: string | null) => {
    setSelectedKey(key);
    window.history.replaceState(
      null,
      "",
      key ? `/inbox?selected=${encodeURIComponent(key)}` : "/inbox",
    );
  }, []);

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
  const hasSelection = selectedKey != null;

  return (
    <div className="flex gap-4">
      <FolderSidebar folders={folders} folder={folder} collapsed={hasSelection} />

      {/* Thread list: full width panel normally, 340px rail beside the open
          thread. On mobile the open thread takes over and the list hides. */}
      <div
        className={hasSelection ? "hidden min-w-0 shrink-0 md:block" : "min-w-0 flex-1"}
        style={{ width: hasSelection ? 340 : undefined, transition: "width .22s ease" }}
      >
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

        <div className={`relative mb-4 ${hasSelection ? "" : "sm:max-w-sm"}`}>
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
                    <Row
                      key={t.key}
                      t={t}
                      first={i === 0}
                      compact={hasSelection}
                      selected={t.key === selectedKey}
                      onSelect={select}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {selectedKey ? (
        <DetailPanel key={selectedKey} threadKey={selectedKey} onClose={() => select(null)} />
      ) : null}
    </div>
  );
}

// The open thread slides in from the right on mount and whenever the
// selected key changes (the key prop remounts this panel per thread).
function DetailPanel({ threadKey, onClose }: { threadKey: string; onClose: () => void }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);
  return (
    <div
      className="min-w-[320px] flex-1"
      style={{
        transform: entered ? "translateX(0)" : "translateX(20px)",
        opacity: entered ? 1 : 0,
        transition: "transform .25s cubic-bezier(0.22,1,0.36,1), opacity .2s",
      }}
    >
      <ThreadDetail threadKey={threadKey} onClose={onClose} />
    </div>
  );
}

function FolderSidebar({
  folders,
  folder,
  collapsed,
}: {
  folders: Folder[];
  folder: string;
  collapsed: boolean;
}) {
  const top = folders.filter((f) => f.group === "top");
  const pathways = folders.filter((f) => f.group === "pathway");
  return (
    <aside
      className="hidden shrink-0 overflow-hidden md:block"
      style={{ width: collapsed ? 28 : 186, transition: "width .22s ease" }}
    >
      {collapsed ? (
        <nav className="flex flex-col items-center gap-1 pt-1">
          {top.map((f) => (
            <Link
              key={f.key}
              href={href(f.key)}
              title={f.label}
              className={`flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold ${
                f.key === folder ? "bg-accentSoft text-accent" : "text-muted hover:bg-surface2"
              }`}
            >
              {f.label.charAt(0)}
            </Link>
          ))}
          <span className="my-1.5 h-px w-4 bg-border" />
          {pathways.map((f) => (
            <Link
              key={f.key}
              href={href(f.key)}
              title={f.label}
              className={`flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface2 ${
                f.key === folder ? "bg-accentSoft" : ""
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: PATHWAY[f.key]?.color ?? "var(--ink-3)" }}
              />
            </Link>
          ))}
        </nav>
      ) : (
        <>
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
        </>
      )}
    </aside>
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

function Row({
  t,
  first,
  compact,
  selected,
  onSelect,
}: {
  t: InboxThread;
  first: boolean;
  compact: boolean;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  const router = useRouter();
  const hue = customerHue(t.accountName || t.who);
  const outbound = t.lastDirection === "outbound";
  const high = t.priority === "high";
  const unmapped = !t.accountName && t.needsReview;
  // Second state dot: amber "needs action" — AI-flagged for a reply and not yet
  // reviewed. Clears only when Jordan marks the thread reviewed.
  const needsAction = (t.needsReply || t.needsReview) && !t.reviewed;

  const [flagged, setFlagged] = useState(t.flagged);
  const [archived, setArchived] = useState(false);
  const [pathway, setPathway] = useState(t.pathway);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  // The pathway popover closes on outside click / Escape (it used to stay
  // open until another explicit toggle).
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  async function threadAction(action: "flag" | "unflag" | "archive") {
    setBusy(true);
    try {
      await fetch("/api/inbox/thread-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: t.key, action }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function onFlag(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !flagged;
    setFlagged(next);
    await threadAction(next ? "flag" : "unflag");
  }

  async function onArchive(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setArchived(true);
    await threadAction("archive");
    router.refresh();
  }

  async function onPathway(e: React.MouseEvent, key: string) {
    e.preventDefault();
    e.stopPropagation();
    setPathway(key);
    setMenu(false);
    setBusy(true);
    try {
      await fetch("/api/inbox/triage-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: t.key, pathway: key }),
      });
    } finally {
      setBusy(false);
    }
  }

  if (archived) return null;
  const curPath = pathway ? PATHWAY[pathway] : null;

  // Panel-open mode: rows compress to subject + time + state dots so the
  // 340px rail stays scannable. The open thread is highlighted.
  if (compact) {
    return (
      <Link
        href={`/inbox/${encodeURIComponent(t.key)}`}
        onClick={(e) => {
          e.preventDefault();
          onSelect(t.key);
        }}
        className={`relative flex items-center gap-2 px-3 py-2.5 transition-colors ${
          first ? "" : "border-t border-border"
        } ${selected ? "bg-accentSoft" : "hover:bg-surface2"}`}
      >
        {selected ? (
          <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--accent)" }} />
        ) : flagged || high ? (
          <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--due)" }} />
        ) : null}
        {t.unread ? (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} title="Unread" />
        ) : null}
        {needsAction ? (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--warm)" }} title="Needs action" />
        ) : null}
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            selected ? "font-semibold text-accent" : t.unread ? "font-bold text-fg" : "font-medium text-fg/85"
          }`}
        >
          {t.subject}
        </span>
        <span className="shrink-0 text-2xs tabular-nums text-muted">{rel(t.lastAtISO)}</span>
      </Link>
    );
  }

  return (
    <Link
      href={`/inbox/${encodeURIComponent(t.key)}`}
      onClick={(e) => {
        e.preventDefault();
        onSelect(t.key);
      }}
      className={`group relative flex gap-3 px-3 py-3 transition-colors hover:bg-surface2 sm:px-4 ${
        first ? "" : "border-t border-border"
      }`}
    >
      {flagged || high ? (
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--due)" }} />
      ) : null}

      {unmapped ? (
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-line2 text-sm font-bold text-muted">
          ?
        </div>
      ) : (
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: hue.hue }}
        >
          {initials(t.who)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Lead with the MATTER (subject), not the sender. */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {t.unread ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: "var(--accent)" }}
                title="Unread"
              />
            ) : null}
            {needsAction ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: "var(--warm)" }}
                title="Needs action"
              />
            ) : null}
            {outbound ? <SentGlyph /> : null}
            <span className={`truncate text-sm ${t.unread ? "font-bold text-fg" : "font-semibold text-fg/90"}`}>
              {t.subject}
            </span>
            {t.count > 1 ? (
              <span className="shrink-0 rounded-full bg-surface2 px-1.5 text-2xs font-semibold tabular-nums text-fg/60">
                {t.count}
              </span>
            ) : null}
          </div>
          {/* Hover reveal: timestamp swaps for the quick-action bar. */}
          <span className="shrink-0 text-2xs tabular-nums text-muted group-hover:opacity-0">{rel(t.lastAtISO)}</span>
          <ActionBar
            flagged={flagged}
            busy={busy}
            menu={menu}
            curPath={curPath}
            onToggleMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu((m) => !m);
            }}
            onPathway={onPathway}
            onFlag={onFlag}
            onArchive={onArchive}
          />
        </div>

        {/* WHY it matters, strict chip hierarchy: linked task leads, then
            High, pathway, account, status (smaller), attachment (smallest). */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {t.linkedTask ? (
            <span
              className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] ${
                t.linkedTask.overdue ? "font-bold" : "font-medium"
              }`}
              style={
                t.linkedTask.overdue
                  ? { background: "var(--due-soft)", color: "var(--due)" }
                  : { background: "var(--surface-2)", color: "var(--ink-2, inherit)" }
              }
              title={t.linkedTask.title}
            >
              <TaskGlyph />
              <span className="truncate">
                {t.linkedTask.overdue
                  ? `Task overdue${t.linkedTask.due ? ` ${shortDate(t.linkedTask.due)}` : ""}`
                  : t.linkedTask.due
                    ? `Task due ${shortDate(t.linkedTask.due)}`
                    : "Linked task"}
                {": "}
                {t.linkedTask.title}
              </span>
            </span>
          ) : null}
          {high ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: "var(--due-soft)", color: "var(--due)" }}
            >
              High
            </span>
          ) : null}
          {curPath ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: withAlpha(curPath.color), color: curPath.color }}
            >
              {curPath.label}
            </span>
          ) : null}
          {t.accountName ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: hue.soft, color: hue.hue }}
            >
              {t.accountName}
            </span>
          ) : unmapped ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line2 px-2 py-0.5 text-[10px] font-medium text-muted">
              <LinkGlyph /> Link account
            </span>
          ) : null}
          {t.reviewed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[9px] font-medium text-ok">
              ✓ Reviewed
            </span>
          ) : null}
          {t.replied ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[9px] font-medium text-ok">
              Replied
            </span>
          ) : null}
          {t.hasAttachments ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[9px] font-medium text-muted">
              <ClipIcon /> Attachment
            </span>
          ) : null}
        </div>

        {/* Sender demoted to context: who said it, plus the AI gist. */}
        <div className="mt-1 flex items-start gap-1.5 text-xs">
          <span className="shrink-0 font-medium text-fg/60">{t.who}</span>
          {t.summary ? (
            <span className="line-clamp-2 min-w-0 text-fg/70">
              <SparkGlyph className="mr-1 inline h-3 w-3 text-accent" />
              {t.summary}
            </span>
          ) : t.preview ? (
            <span className="min-w-0 truncate text-muted">{t.preview}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TaskGlyph() {
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

// Quick actions revealed on row hover: pathway assign (popover), flag, archive.
function ActionBar({
  flagged,
  busy,
  menu,
  curPath,
  onToggleMenu,
  onPathway,
  onFlag,
  onArchive,
}: {
  flagged: boolean;
  busy: boolean;
  menu: boolean;
  curPath: { label: string; color: string } | null;
  onToggleMenu: (e: React.MouseEvent) => void;
  onPathway: (e: React.MouseEvent, key: string) => void;
  onFlag: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="pointer-events-none absolute right-3 top-2.5 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 sm:right-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative">
        <IconBtn label="Assign pathway" onClick={onToggleMenu} active={menu} disabled={busy}>
          <TagGlyph />
        </IconBtn>
        {menu ? (
          <div className="absolute right-0 top-8 w-40 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-elevated">
            {Object.entries(PATHWAY).map(([key, p]) => (
              <button
                key={key}
                type="button"
                onClick={(e) => onPathway(e, key)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface2 ${
                  curPath?.label === p.label ? "font-semibold text-fg" : "text-fg/75"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <IconBtn label={flagged ? "Unflag" : "Flag"} onClick={onFlag} active={flagged} disabled={busy}>
        <FlagGlyph filled={flagged} />
      </IconBtn>
      <IconBtn label="Archive" onClick={onArchive} disabled={busy}>
        <ArchiveGlyph />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-fg disabled:opacity-40 ${
        active ? "text-accent" : ""
      }`}
    >
      {children}
    </button>
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
function TagGlyph() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2H2v10l9.29 9.29a2 2 0 0 0 2.83 0l7.17-7.17a2 2 0 0 0 0-2.83z" />
      <path d="M7 7h.01" />
    </svg>
  );
}
function FlagGlyph({ filled }: { filled?: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </svg>
  );
}
function ArchiveGlyph() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </svg>
  );
}
function LinkGlyph() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}
