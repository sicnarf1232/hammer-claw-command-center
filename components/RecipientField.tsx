"use client";

import { useEffect, useRef, useState } from "react";
import {
  completedTokens,
  currentToken,
  insertRecipientToken,
  type RecipientSuggestion,
} from "@/lib/recipientSuggest";

// To/Cc typeahead (dev-feedback #15): as Jordan types a name or partial
// email, surfaces matching contacts plus email-history suggestions from
// GET /api/people/search. Stays a plain comma-separated text field
// underneath (paste-a-raw-address-list keeps working); the dropdown is a
// pure convenience layered on top, never a hard gate.
export default function RecipientField({
  label,
  value,
  onChange,
  otherFieldValue,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  otherFieldValue?: string;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  function fetchSuggestions(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const exclude = [...completedTokens(value), ...completedTokens(otherFieldValue ?? "")];
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (exclude.length) params.set("exclude", exclude.join(","));
      try {
        const res = await fetch(`/api/people/search?${params.toString()}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data.results) ? data.results : []);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
      }
    }, 150);
  }

  function handleChange(v: string) {
    onChange(v);
    setOpen(true);
    fetchSuggestions(currentToken(v));
  }

  function handleFocus() {
    setOpen(true);
    fetchSuggestions(currentToken(value));
  }

  function pick(s: RecipientSuggestion) {
    const next = insertRecipientToken(value, s);
    onChange(next);
    setOpen(false);
    setSuggestions([]);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex items-start gap-3">
      <span className="mt-2 w-14 shrink-0 text-xs font-medium text-muted">{label}</span>
      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={() => {
            blurTimeoutRef.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="input w-full text-sm"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          autoComplete="off"
        />
        {open && suggestions.length > 0 ? (
          <ul className="absolute left-14 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-xl border border-border bg-surface shadow-elevated">
            {suggestions.map((s, i) => (
              <li key={s.email}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs ${
                    i === activeIdx ? "bg-accentSoft text-accent" : "text-fg/85 hover:bg-surface2"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {s.name ? <span className="font-medium">{s.name}</span> : null}
                    <span className={s.name ? "ml-1.5 text-muted" : ""}>{s.email}</span>
                  </span>
                  {s.source === "history" ? (
                    <span className="shrink-0 text-2xs text-muted">recent</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
