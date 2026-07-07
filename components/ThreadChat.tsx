"use client";

import { useRef, useState } from "react";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// Conversational brain over the open thread (focus mode). Ask it to summarize,
// extract asks, or draft a reply to a specific person; a drafted message can be
// inserted straight into the composer.
export default function ThreadChat({
  threadKey,
  onUseAsReply,
}: {
  threadKey: string;
  onUseAsReply: (text: string) => void;
}) {
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next: ChatMsg[] = [...history, { role: "user", content }];
    setHistory(next);
    setInput("");
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/thread-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadKey, history: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Chat failed.");
      } else {
        setHistory([...next, { role: "assistant", content: data.text ?? "" }]);
        setTimeout(() => scrollRef.current?.scrollTo({ top: 1e6 }), 50);
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-3 py-2">
        <span className="eyebrow text-muted">Thread brain</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-auto p-3">
        {history.length === 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted">
              Ask anything about this thread, or have it draft for you:
            </p>
            {[
              "Summarize this thread and what they need from me",
              "Extract every open ask, owner, and date",
              "Draft a reply to the latest message",
            ].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={busy}
                className="block w-full rounded-lg border border-border px-2.5 py-1.5 text-left text-xs text-fg/75 hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {history.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[95%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-fg"
                  : "border border-border bg-surface2 text-fg/85"
              }`}
            >
              {m.content}
            </div>
            {m.role === "assistant" && m.content ? (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => onUseAsReply(m.content)}
                  className="text-2xs font-semibold text-accent hover:underline"
                >
                  Insert into reply →
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {busy ? <div className="text-xs text-muted">Thinking…</div> : null}
        {err ? <div className="text-xs text-danger">{err}</div> : null}
      </div>
      <div className="border-t border-border p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Ask about this thread, or 'draft a reply to Zoya about…'"
            className="input min-h-[3rem] flex-1 resize-none px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={busy || !input.trim()}
            className="btn-primary text-xs disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
