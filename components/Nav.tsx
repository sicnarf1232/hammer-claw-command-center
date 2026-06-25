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
  SparkIcon,
  LibraryIcon,
  BrandIcon,
  type IconProps,
} from "./icons";
import ThemeToggle from "./ThemeToggle";

const ITEMS: { href: string; label: string; Icon: ComponentType<IconProps> }[] =
  [
    { href: "/today", label: "Today", Icon: TodayIcon },
    { href: "/ask", label: "Ask", Icon: SparkIcon },
    { href: "/tasks", label: "Tasks", Icon: TasksIcon },
    { href: "/inbox", label: "Inbox", Icon: InboxIcon },
    { href: "/accounts", label: "Accounts", Icon: AccountsIcon },
    { href: "/contacts", label: "Contacts", Icon: AccountsIcon },
    { href: "/meetings", label: "Meetings", Icon: MeetingsIcon },
    { href: "/library", label: "Library", Icon: LibraryIcon },
    { href: "/quote", label: "Quote", Icon: QuoteIcon },
    { href: "/branding", label: "Branding", Icon: BrandIcon },
    { href: "/notifications", label: "Activity", Icon: ActivityIcon },
  ];

// Film Room logo mark: a rounded square in the accent color with a small
// skewed film-strip glyph.
function LogoMark() {
  return (
    <span
      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px]"
      style={{ background: "var(--accent)", boxShadow: "0 4px 12px rgb(81 69 230 / 0.32)" }}
      aria-hidden
    >
      <span className="flex items-end gap-[3px]">
        <span className="block w-1 rounded-[2px]" style={{ height: 15, background: "var(--accent-ink)", transform: "skewX(-12deg)" }} />
        <span className="block w-1 rounded-[2px]" style={{ height: 10, background: "var(--accent-ink)", opacity: 0.7, transform: "skewX(-12deg)" }} />
      </span>
    </span>
  );
}

export default function Nav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[236px] shrink-0 flex-col border-r border-border bg-surface px-3.5 py-[18px]">
      <Link href="/meetings" className="flex items-center gap-3 px-2.5 pb-5 pt-1.5">
        <LogoMark />
        <span className="leading-none">
          <span className="block text-[17px] font-bold tracking-tight text-fg">
            Film Room
          </span>
          <span
            className="mt-1 block text-[8px] font-semibold uppercase text-muted"
            style={{ letterSpacing: "0.22em" }}
          >
            Meeting Intelligence
          </span>
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm font-semibold transition-colors"
              style={
                active
                  ? {
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      boxShadow: "inset 3px 0 0 var(--accent)",
                    }
                  : { color: "var(--ink-2)" }
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </aside>
  );
}
