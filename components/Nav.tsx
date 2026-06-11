import Link from "next/link";

const ITEMS = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/meetings", label: "Meetings" },
  { href: "/quote", label: "Quote" },
  { href: "/notifications", label: "Activity" },
];

export default function Nav() {
  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-white md:h-screen md:w-56 md:border-b-0 md:border-r">
      <div className="px-5 py-4">
        <div className="text-sm font-semibold tracking-tight text-slate-900">
          Hammer Claw
        </div>
        <div className="text-xs text-slate-500">Command Center</div>
      </div>
      <nav className="flex gap-1 px-3 pb-3 md:flex-col">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {it.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
