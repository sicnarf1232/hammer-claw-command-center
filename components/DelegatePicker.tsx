"use client";

import { useEffect, useRef, useState } from "react";

// Lightweight person picker for the "Delegated to" field (dev-feedback #20).
// A trimmed sibling of RecipientField.tsx: same debounced-search-dropdown
// shape, but resolves to a single person object (id + name + email) rather
// than inserting a token into a comma-separated text field, and hits
// /api/tasks/delegates (lib/peopleSearch.ts's searchPeople) instead of the
// compose typeahead's history-merged endpoint.

export interface DelegateCandidate {
  id: number;
  name: string;
  email: string | null;
}

export default function DelegatePicker({
  value,
  onChange,
}: {
  value: DelegateCandidate | null;
  onChange: (person: DelegateCandidate | null) => void;
}) {
  const [q, setQ] = useState(value?.name ?? "");
  const [results, setResults] = useState<DelegateCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  function search(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/delegates?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setResults([]);
      }
    }, 150);
  }

  function handleChange(v: string) {
    setQ(v);
    onChange(null); // typing invalidates the prior selection until a result is picked
    setOpen(true);
    search(v);
  }

  function pick(person: DelegateCandidate) {
    onChange(person);
    setQ(person.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        aria-label="Delegate"
        value={q}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => {
          setOpen(true);
          search(q);
        }}
        onBlur={() => {
          blurTimeoutRef.current = setTimeout(() => setOpen(false), 120);
        }}
        placeholder="Search people…"
        className="input py-1 text-xs"
        autoFocus
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
      />
      {open && results.length > 0 ? (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-48 min-w-[11rem] overflow-auto rounded-xl border border-border bg-surface shadow-elevated">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs text-fg/85 hover:bg-surface2"
              >
                <span className="truncate font-medium">{r.name}</span>
                {r.email ? <span className="shrink-0 truncate text-2xs text-muted">{r.email}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
