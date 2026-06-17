"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";

// Toggles the `.dark` class on <html> and persists the choice. The initial
// class is set pre-paint by the inline script in layout.tsx (no flash).
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border text-ink2 transition-colors hover:text-[color:var(--accent)]"
      style={{ borderColor: "var(--line-2)" }}
    >
      {dark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
}
