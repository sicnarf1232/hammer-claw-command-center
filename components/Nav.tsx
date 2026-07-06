"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  DashboardIcon,
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
  SettingsIcon,
  ChevronLeftIcon,
  type IconProps,
} from "./icons";
import ThemeToggle from "./ThemeToggle";

type Item = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  dot?: "accent" | "danger";
};

// Two-tier nav (Main St. handoff §2.2). Primary destinations, a TOOLS group, and
// a bottom utility group.
const PRIMARY: Item[] = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/inbox", label: "Inbox", Icon: InboxIcon, dot: "accent" },
  { href: "/accounts", label: "Accounts", Icon: AccountsIcon },
  { href: "/meetings", label: "Meetings", Icon: MeetingsIcon },
];
const SECONDARY: Item[] = [
  { href: "/today", label: "Today", Icon: TodayIcon },
  { href: "/ask", label: "Ask", Icon: SparkIcon },
  { href: "/tasks", label: "Tasks", Icon: TasksIcon },
  { href: "/contacts", label: "Contacts", Icon: AccountsIcon },
  { href: "/quote", label: "Quote", Icon: QuoteIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
];
const BOTTOM: Item[] = [
  { href: "/branding", label: "Branding", Icon: BrandIcon },
  { href: "/notifications", label: "Activity", Icon: ActivityIcon, dot: "danger" },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

// Mobile bottom tab bar (§2.3).
const MOBILE_TABS: Item[] = [
  { href: "/dashboard", label: "Home", Icon: DashboardIcon },
  { href: "/inbox", label: "Inbox", Icon: InboxIcon },
  { href: "/accounts", label: "Accounts", Icon: AccountsIcon },
  { href: "/today", label: "Today", Icon: TodayIcon },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function setNavWidth(collapsed: boolean) {
  document.documentElement.style.setProperty("--nav-w", collapsed ? "64px" : "236px");
}

// Main St. brand: the transparent icon mark (theme-swapped — ivory mark on dark,
// navy mark on light) paired with a text wordmark in the display face. The
// packaged PNGs are square lockups with a baked background, so they only work as
// the standalone mark; the "Main St." wordmark is set in type for crispness.
function MarkImg({ className }: { className?: string }) {
  return (
    <>
      <img src="/logos/mainst-mark-light.png" alt="" aria-hidden className={`hidden object-contain dark:block ${className ?? ""}`} />
      <img src="/logos/mainst-mark-dark.png" alt="" aria-hidden className={`block object-contain dark:hidden ${className ?? ""}`} />
    </>
  );
}

function Wordmark({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return <MarkImg className="h-8 w-8" />;
  }
  return (
    <span className="flex items-center gap-2">
      <MarkImg className="h-8 w-8" />
      <span className="font-display text-[19px] font-bold leading-none tracking-tight text-fg">
        Main St<span className="text-accent">.</span>
      </span>
    </span>
  );
}

function Dot({ kind }: { kind: "accent" | "danger" }) {
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{
        background: kind === "danger" ? "var(--due)" : "var(--accent)",
        boxShadow: `0 0 8px ${kind === "danger" ? "var(--due)" : "var(--accent)"}`,
      }}
    />
  );
}

function NavItem({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: Item;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center rounded-[11px] text-sm font-semibold transition-colors ${
        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
      }`}
      style={
        active
          ? {
              background: "var(--accent-soft)",
              color: "var(--accent)",
              boxShadow: "inset 2.5px 0 0 var(--accent)",
            }
          : { color: "var(--ink-2)" }
      }
    >
      <span className="relative flex items-center">
        <item.Icon className="h-[18px] w-[18px] shrink-0" />
        {collapsed && item.dot ? (
          <span className="absolute -right-1 -top-1">
            <Dot kind={item.dot} />
          </span>
        ) : null}
      </span>
      {!collapsed ? (
        <>
          <span className="flex-1">{item.label}</span>
          {item.dot ? <Dot kind={item.dot} /> : null}
        </>
      ) : null}
    </Link>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile "More" drawer
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapse preference.
  useEffect(() => {
    const c = localStorage.getItem("nav-collapsed") === "1";
    setCollapsed(c);
    setNavWidth(c);
  }, []);

  // Close the drawer on navigation; auto-collapse the desktop rail on navigate.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("nav-collapsed", next ? "1" : "0");
      setNavWidth(next);
      return next;
    });
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-nav py-[18px] transition-[width] duration-200 md:flex"
        style={{ width: "var(--nav-w, 236px)" }}
      >
        <div className={`flex items-center pb-5 pt-1 ${collapsed ? "justify-center px-2" : "justify-between px-3.5"}`}>
          <Link href="/dashboard" className="flex items-center">
            <Wordmark collapsed={collapsed} />
          </Link>
          {!collapsed ? (
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label="Collapse sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted hover:bg-surface2 hover:text-fg"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label="Expand sidebar"
            className="mx-2 mb-2 flex h-7 items-center justify-center rounded-[8px] text-muted hover:bg-surface2 hover:text-fg"
          >
            <ChevronLeftIcon className="h-4 w-4 rotate-180" />
          </button>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5">
          {PRIMARY.map((it) => (
            <NavItem key={it.href} item={it} active={isActive(pathname, it.href)} collapsed={collapsed} />
          ))}

          <div className={`my-2 ${collapsed ? "mx-1" : "mx-1"}`}>
            <div className="border-t border-border" />
            {!collapsed ? (
              <div className="eyebrow mt-2.5 px-1.5 text-[9.5px] text-muted">Tools</div>
            ) : null}
          </div>

          {SECONDARY.map((it) => (
            <NavItem key={it.href} item={it} active={isActive(pathname, it.href)} collapsed={collapsed} />
          ))}
        </div>

        <div className="mt-2 flex flex-col gap-0.5 border-t border-border px-2.5 pt-2.5">
          {BOTTOM.map((it) => (
            <NavItem key={it.href} item={it} active={isActive(pathname, it.href)} collapsed={collapsed} />
          ))}
          <ThemeToggle collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-nav/95 backdrop-blur-md md:hidden">
        {MOBILE_TABS.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold"
              style={{ color: active ? "var(--accent)" : "var(--ink-3)" }}
            >
              <it.Icon className="h-[20px] w-[20px]" />
              {it.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold"
          style={{ color: "var(--ink-3)" }}
        >
          <MenuIcon />
          More
        </button>
      </nav>

      {/* Mobile "More" drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[22px] border-t border-border bg-nav px-3.5 pb-8 pt-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between px-1">
              <Wordmark collapsed={false} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted hover:text-fg"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-0.5">
              {[...PRIMARY, ...SECONDARY, ...BOTTOM].map((it) => (
                <NavItem
                  key={it.href}
                  item={it}
                  active={isActive(pathname, it.href)}
                  collapsed={false}
                  onNavigate={() => setOpen(false)}
                />
              ))}
              <div className="mt-1 border-t border-border pt-1">
                <ThemeToggle collapsed={false} />
              </div>
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
      <path d="M4 6h16M4 12h16M4 18h16" />
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
