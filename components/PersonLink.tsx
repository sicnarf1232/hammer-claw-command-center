"use client";

import Link from "next/link";
import { initials } from "@/lib/customerHues";
import { useBrandColors, tintFor } from "@/components/BrandColors";

// A person's name as an interactive chip: subtle zoom on hover, a mini contact
// card (name + company) on hover, and a click through to their /people profile.
// `kind` colors the chip by side (internal vs customer) using the brand colors.
export default function PersonLink({
  name,
  company,
  kind,
  count,
}: {
  name: string;
  company?: string;
  kind?: "internal" | "customer";
  count?: number; // e.g. rolling attendance, shown as "N×" inside the chip
}) {
  const { colors } = useBrandColors();
  const tint = tintFor(kind, colors);
  // Only classified people get a team color; unknown people stay neutral gray so
  // an unclassified person never looks like "a customer" (or any team).
  const avatarStyle = tint
    ? { background: `${tint}22`, color: tint }
    : { background: "var(--surface-2)", color: "var(--muted)" };
  return (
    <span className="group relative inline-flex">
      <Link
        href={`/people/${encodeURIComponent(name)}`}
        className="chip origin-left transition-transform duration-150 hover:scale-[1.06]"
        style={{ borderColor: tint ?? "var(--line-2)" }}
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold"
          style={avatarStyle}
        >
          {initials(name)}
        </span>
        <span className="font-normal text-fg">{name}</span>
        {count != null && (
          <span
            className="ml-0.5 rounded-full px-1.5 text-[10px] font-bold"
            style={tint ? { background: `${tint}22`, color: tint } : { background: "var(--surface-2)", color: "var(--muted)" }}
          >
            {count}×
          </span>
        )}
      </Link>
      <span
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-52 rounded-[12px] border p-3 shadow-lg group-hover:block"
        style={{ borderColor: "var(--line-2)", background: "var(--surface)" }}
      >
        <span className="block text-sm font-semibold text-fg">{name}</span>
        <span className="mt-0.5 block text-xs text-muted">
          {company ?? "Contact"}
        </span>
        <span
          className="mt-1.5 block text-2xs font-semibold"
          style={{ color: "var(--accent)" }}
        >
          Open profile & related tasks →
        </span>
      </span>
    </span>
  );
}
