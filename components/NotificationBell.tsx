"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SEEN_KEY = "notif-seen-at";

// Nav bell: unseen-notification count since the last time the bell was
// opened (stamped in localStorage). Clicking goes to /notifications.
export default function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const [count, setCount] = useState(0);

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

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {}
    setCount(0);
  }

  return (
    <Link
      href="/notifications"
      onClick={markSeen}
      title="Notifications"
      className="relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-nav-fg/80 transition-colors hover:bg-nav-hover hover:text-nav-fg"
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
    </Link>
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
