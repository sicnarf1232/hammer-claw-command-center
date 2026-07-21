"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notificationHref } from "@/lib/notifyLink";
import { formatRelativeTime } from "@/lib/dates";
import { ActivityIcon, AlertIcon, ClockIcon, InboxIcon, SparkIcon, type IconProps } from "./icons";

const SEEN_KEY = "notif-seen-at";

interface RecentNotification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  meta: unknown;
  createdAt: string;
}

// Same per-kind treatment as the /notifications page, kept in sync there.
const KIND_META: Record<string, { classes: string; Icon: (p: IconProps) => React.ReactElement }> = {
  due_today: { classes: "border-warning/25 bg-warning/10 text-warning", Icon: ClockIcon },
  new_email: { classes: "border-info/25 bg-info/10 text-info", Icon: InboxIcon },
  brief: { classes: "border-accent/25 bg-accent/10 text-accent", Icon: SparkIcon },
  error: { classes: "border-danger/25 bg-danger/10 text-danger", Icon: AlertIcon },
};
const DEFAULT_KIND_META = { classes: "border-border bg-surface2 text-muted", Icon: ActivityIcon };

// Nav bell: unseen-notification count since the last time the bell was
// opened (stamped in localStorage). Clicking opens a dropdown of the most
// recent notifications, each linking straight to where it lives (dev-feedback
// #20 Part A: this used to just link to /notifications with no preview).
export default function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentNotification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const since = localStorage.getItem(SEEN_KEY);
        const res = await fetch(
          `/api/notifications/count${since ? `?since=${encodeURIComponent(since)}` : ""}`,
        );
        const data = await res.json().catch(() => ({}));
        if (alive && typeof data.count === "number") setCount(data.count);
      } catch {
        // leave the last known count
      }
    }
    poll();
    const id = setInterval(poll, 120_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {}
    setCount(0);
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ bottom: window.innerHeight - r.bottom, left: r.right + 8 });
    setOpen(true);
    markSeen();
    if (items == null) {
      setLoading(true);
      try {
        const res = await fetch("/api/notifications/recent?limit=8");
        const data = await res.json().catch(() => ({}));
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-nav-fg/80 transition-colors hover:bg-nav-hover hover:text-nav-fg"
      >
        <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <BellIcon className="h-[18px] w-[18px]" />
          {count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-none text-white">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
        {!collapsed && <span>Notifications</span>}
      </button>

      {open && pos ? (
        <div
          ref={panelRef}
          className="fixed z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated"
          style={{ bottom: pos.bottom, left: pos.left }}
        >
          <div className="border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-fg">Notifications</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-xs text-muted">Loading...</div>
            ) : !items || items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted">Nothing yet.</div>
            ) : (
              items.map((n) => {
                const target = notificationHref(n.kind, n.meta);
                const href = target ?? "/notifications";
                const meta = KIND_META[n.kind] ?? DEFAULT_KIND_META;
                const Icon = meta.Icon;
                return (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-surface2"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${meta.classes}`}
                      aria-hidden="true"
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-fg">{n.title}</div>
                      {n.body ? <div className="truncate text-2xs text-muted">{n.body}</div> : null}
                      <div className="mt-0.5 text-2xs text-muted/70">{formatRelativeTime(n.createdAt)}</div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="border-t border-border px-4 py-2.5 text-center text-xs font-semibold text-accent hover:bg-surface2"
          >
            See all &rarr;
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
