"use client";

import Link from "next/link";
import React, { useRef, useState } from "react";

// Labeled flyout for collapsed icon rails: hovering an icon shows its name (and
// count) instead of leaving Jordan to guess from glyphs. The popout renders at
// a fixed viewport position so scroll containers and overflow clipping cannot
// eat it, and it stays a DOM child of the anchor so moving the pointer onto it
// keeps the hover alive. With an href the popout itself is a real click target.
export default function HoverPopout({
  label,
  detail,
  href,
  children,
}: {
  label: string;
  detail?: React.ReactNode;
  href?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const body = (
    <span className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-fg shadow-elevated">
      {label}
      {detail != null ? <span className="text-2xs tabular-nums text-muted">{detail}</span> : null}
    </span>
  );

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ top: r.top + r.height / 2, left: r.right });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos ? (
        // pl bridges the anchor edge so the pointer never crosses a dead gap.
        <div className="fixed z-50 -translate-y-1/2 pl-1.5" style={{ top: pos.top, left: pos.left }}>
          {href ? (
            <Link href={href} onClick={() => setPos(null)}>
              {body}
            </Link>
          ) : (
            body
          )}
        </div>
      ) : null}
    </div>
  );
}
