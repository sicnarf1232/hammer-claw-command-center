"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
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

function Wordmark() {
  return (
    <span className="leading-none">
      <span className="block font-display text-[18px] font-extrabold uppercase tracking-tight text-fg">
        Film Room
      </span>
      <span
        className="mt-1 block font-display text-[8px] font-extrabold uppercase text-muted"
        style={{ letterSpacing: "0.22em" }}
      >
        Meeting Intelligence
      </span>
    </span>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
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
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-border bg-surface px-3.5 py-[18px] md:flex">
        <Link href="/meetings" className="flex items-center gap-3 px-2.5 pb-5 pt-1.5">
          <LogoMark />
          <Wordmark />
        </Link>
        <NavLinks />
        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/85 px-4 backdrop-blur-md md:hidden">
        <Link href="/meetings" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-display text-[15px] font-extrabold uppercase tracking-tight text-fg">
            Film Room
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-[11px] border border-border bg-surface text-fg active:scale-95"
        >
          <MenuIcon />
        </button>
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
          />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col border-r border-border bg-surface px-3.5 py-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <LogoMark />
                <Wordmark />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted hover:text-fg"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <ThemeToggle />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
