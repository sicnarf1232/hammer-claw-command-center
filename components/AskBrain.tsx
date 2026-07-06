"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

// Milestone 2 #5: the brain chat. Asks /api/ask, which grounds the answer in the
// live vault. Light conversational memory (recent turns sent back).

interface Turn {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

const SUGGESTIONS = [
  "What is open and overdue for Stryker?",
  "Summarize where things stand with Terumo.",
  "What is our price on part MSS031?",
  "What did I commit to in my last meeting?",
];

export default function AskBrain() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const params = useSearchParams();
  const seeded = useRef(false);

  // A ?q= param (e.g. from the dashboard Ask bar) auto-asks once on load.
  useEffect(() => {
    if (seeded.current) return;
    const q = params.get("q");
    if (q && q.trim()) {
      seeded.current = true;
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setErr(null);
    setInput("");
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    const next = [...turns, { role: "user" as const, content: q }];
    setTurns(next);
    setBusy(true);
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: 1e9, behavior: "smooth" }));
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not get an answer.");
        setTurns(next); // keep the question visible
      } else {
        setTurns([...next, { role: "assistant", content: data.answer, sources: data.sources }]);
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: 1e9, behavior: "smooth" }));
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-150px)] max-w-3xl flex-col">
      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto pb-4">
        {turns.length === 0 ? (
          <div className="card p-6">
            <p className="text-sm text-fg">
              Ask anything about your Merit OEM world. Answers are grounded in the
              vault (accounts, contacts, open tasks, meetings), never invented.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-[10px] border px-3 py-2 text-left text-sm text-ink2 transition-colors hover:border-primary/40 hover:text-fg"
                  style={{ borderColor: "var(--line)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => <Bubble key={i} turn={t} />)
        )}
        {busy && (
          <div className="flex items-center gap-2 px-1 text-sm text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
            Reading the vault…
          </div>
        )}
      </div>

      {err && <p className="mb-2 text-sm text-danger">{err}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2 border-t pt-3"
        style={{ borderColor: "var(--line)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the brain…"
          className="input flex-1"
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary disabled:opacity-50">
          Ask
        </button>
      </form>
    </div>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className="max-w-[85%] rounded-[14px] px-4 py-3 text-sm leading-relaxed"
        style={
          isUser
            ? { background: "var(--accent)", color: "var(--accent-ink)" }
            : { background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--fg)" }
        }
      >
        <div className="whitespace-pre-wrap">{turn.content}</div>
        {turn.sources && turn.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2" style={{ borderColor: "var(--line)" }}>
            {turn.sources.map((s) => (
              <span key={s} className="chip text-2xs" style={{ borderColor: "var(--line-2)" }}>
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
