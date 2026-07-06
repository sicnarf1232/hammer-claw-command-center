"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";

// Toggles the `.dark` class on <html> and persists the choice. The initial
// class is set pre-paint by the inline script in layout.tsx (no flash).
export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
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
      title={collapsed ? (dark ? "Light mode" : "Dark mode") : undefined}
      className={`flex w-full items-center rounded-[11px] py-2.5 text-sm font-semibold transition-colors hover:bg-surface2 ${
        collapsed ? "justify-center px-0" : "gap-3 px-3"
      }`}
      style={{ color: "var(--ink-2)" }}
    >
      {dark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
      {!collapsed ? <span>{dark ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
}
