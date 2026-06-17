"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  TodayIcon,
  TasksIcon,
  InboxIcon,
  AccountsIcon,
  MeetingsIcon,
  QuoteIcon,
  ActivityIcon,
  type IconProps,
} from "./icons";
import ThemeToggle from "./ThemeToggle";

const ITEMS: { href: string; label: string; Icon: ComponentType<IconProps> }[] =
  [
    { href: "/today", label: "Today", Icon: TodayIcon },
    { href: "/tasks", label: "Tasks", Icon: TasksIcon },
    { href: "/inbox", label: "Inbox", Icon: InboxIcon },
    { href: "/accounts", label: "Accounts", Icon: AccountsIcon },
    { href: "/meetings", label: "Meetings", Icon: MeetingsIcon },
    { href: "/quote", label: "Quote", Icon: QuoteIcon },
    { href: "/notifications", label: "Activity", Icon: ActivityIcon },
  ];

// The Film Room logo mark: a rounded square in the accent color with a simple
// geometric play glyph (meeting "film").
function LogoMark() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
      style={{
        background: "var(--accent)",
        boxShadow: "0 6px 16px rgb(81 69 230 / 0.28)",
      }}
      aria-hidden
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M9 7.5v9l7-4.5-7-4.5Z" fill="var(--accent-ink)" />
        <circle
          cx="12"
          cy="12"
          r="9.2"
          stroke="var(--accent-ink)"
          strokeOpacity=".5"
          strokeWidth="1.4"
        />
      </svg>
    </span>
  );
}

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-5 py-3 sm:px-7">
        <Link href="/meetings" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="leading-none">
            <span className="block text-[15px] font-bold tracking-tight text-fg">
              Film Room
            </span>
            <span className="eyebrow mt-1 block text-[10px] text-muted">
              Meeting Intelligence
            </span>
          </span>
        </Link>

        <nav className="ml-2 flex flex-1 items-center gap-0.5 overflow-x-auto">
          {ITEMS.map(({ href, label, Icon }) => {
            const active =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-accentSoft text-[color:var(--accent)]"
                    : "text-ink2 hover:text-[color:var(--accent)]"
                }`}
              >
                <Icon className="h-[16px] w-[16px] shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}
