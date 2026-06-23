"use client";

import { useState, type ReactNode } from "react";

// Clamp long rolling-status content to ~one block by default, with a show-more
// toggle. Keeps the series TL;DR to a glanceable couple of paragraphs.
export default function CondensedStatus({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className={open ? "" : "relative max-h-24 overflow-hidden"}>
        {children}
        {!open && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
            style={{ background: "linear-gradient(to top, var(--warm-soft), transparent)" }}
          />
        )}
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-1.5 text-xs font-semibold"
        style={{ color: "var(--warm)" }}
      >
        {open ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
