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

export default function Nav() {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 border-b border-border bg-surface md:flex md:h-screen md:w-60 md:flex-col md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-card">
          <span className="font-mono text-sm font-bold">HC</span>
        </span>
        <div>
          <div className="text-sm font-semibold tracking-tight text-fg">
            Hammer Claw
          </div>
          <div className="text-2xs uppercase tracking-wider text-muted">
            Command Center
          </div>
        </div>
      </div>

      <nav className="flex gap-1 px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-surface2 text-fg"
                  : "text-muted hover:bg-surface2 hover:text-fg"
              }`}
            >
              <span
                className={`hidden md:block absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <Icon
                className={`h-[18px] w-[18px] shrink-0 ${
                  active ? "text-primary" : ""
                }`}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-border px-3 py-3 md:border-t">
        <ThemeToggle />
      </div>
    </aside>
  );
}
