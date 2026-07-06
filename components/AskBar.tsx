"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SparkIcon } from "./icons";

// Floating Ask bar on the dashboard. Submitting hands the question to /ask,
// which grounds the answer in the vault and auto-asks from the ?q= param.
export default function AskBar() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/ask?q=${encodeURIComponent(query)}` : "/ask");
  }

  return (
    <form
      onSubmit={submit}
      className="flex min-w-[280px] items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-card transition-colors focus-within:border-accent sm:min-w-[340px]"
    >
      <SparkIcon className="h-4 w-4 shrink-0 text-accent" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask anything about your work…"
        className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
        inputMode="search"
      />
      {q.trim() ? (
        <button type="submit" className="shrink-0 text-2xs font-semibold text-accent">
          Ask →
        </button>
      ) : null}
    </form>
  );
}
