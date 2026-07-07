"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// The inbox brain: ONE persistent chat that lives across the whole Inbox tab
// (list, folders, and threads). State survives navigation via the inbox layout
// AND page reloads via sessionStorage; a sync event keeps the layout panel and
// the focus-mode panel on the same conversation. Threads are added to context
// explicitly; the currently open thread is always sent along, so "now draft a
// reply to this newly opened thread" just works.

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface BrainState {
  history: ChatMsg[];
  context: Array<{ key: string; label: string }>;
}

const STORE_KEY = "hc-inbox-brain";
const SYNC_EVENT = "hc-brain-sync";
export const INSERT_REPLY_EVENT = "hc-insert-reply";

function loadState(): BrainState {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as BrainState;
  } catch {}
  return { history: [], context: [] };
}

function saveState(s: BrainState) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {}
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

function activeThreadKeyFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/inbox\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function InboxBrain({
  onUseAsReply,
}: {
  // Focus mode passes a direct callback; the layout panel dispatches the
  // insert event that the thread view listens for.
  onUseAsReply?: (text: string) => void;
}) {
  const pathname = usePathname();
  const activeKey = activeThreadKeyFromPath(pathname ?? "");
  const [state, setState] = useState<BrainState>({ history: [], context: [] });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate + stay in sync with the other mounted instance.
  useEffect(() => {
    setState(loadState());
    const sync = () => setState(loadState());
    window.addEventListener(SYNC_EVENT, sync);
    return () => window.removeEventListener(SYNC_EVENT, sync);
  }, []);

  function update(next: BrainState) {
    setState(next);
    saveState(next);
  }

  function newChat() {
    update({ history: [], context: [] });
    setErr(null);
  }

  function addCurrentThread() {
    if (!activeKey || state.context.some((c) => c.key === activeKey)) return;
    const label = document.title.replace(/ [-|·].*$/, "").slice(0, 40) || activeKey;
    update({ ...state, context: [...state.context, { key: activeKey, label }] });
  }

  function removeContext(key: string) {
    update({ ...state, context: state.context.filter((c) => c.key !== key) });
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const history: ChatMsg[] = [...state.history, { role: "user", content }];
    update({ ...state, history });
    setInput("");
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/thread-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history,
          activeThreadKey: activeKey,
          contextKeys: state.context.map((c) => c.key),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Chat failed.");
      } else {
        update({
          ...state,
          history: [...history, { role: "assistant", content: data.text ?? "" }],
        });
        setTimeout(() => scrollRef.current?.scrollTo({ top: 1e6 }), 50);
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  function insert(text: string) {
    if (onUseAsReply) {
      onUseAsReply(text);
    } else {
      window.dispatchEvent(new CustomEvent(INSERT_REPLY_EVENT, { detail: text }));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="eyebrow text-muted">Inbox brain</span>
        <button
          type="button"
          onClick={newChat}
          className="rounded-lg border border-border px-2 py-0.5 text-2xs text-fg/70 hover:text-fg"
        >
          New chat
        </button>
      </div>

      {/* Context threads the brain is holding, plus the open one. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        {activeKey ? (
          <span className="rounded-full bg-accentSoft px-2 py-0.5 text-2xs font-semibold text-accent">
            Open thread
          </span>
        ) : (
          <span className="text-2xs text-muted">No thread open</span>
        )}
        {state.context
          .filter((c) => c.key !== activeKey)
          .map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-2xs text-fg/70"
              title={c.key}
            >
              {c.label}
              <button
                type="button"
                onClick={() => removeContext(c.key)}
                className="text-muted hover:text-fg"
                aria-label="Remove from context"
              >
                ×
              </button>
            </span>
          ))}
        {activeKey && !state.context.some((c) => c.key === activeKey) ? (
          <button
            type="button"
            onClick={addCurrentThread}
            className="rounded-full border border-dashed border-line2 px-2 py-0.5 text-2xs text-muted hover:text-accent"
            title="Keep this thread in the brain's context after you navigate away"
          >
            + Keep in context
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-auto p-3">
        {state.history.length === 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted">
              One chat across your whole inbox. Open a thread and ask, add
              threads to context, then cross-reference:
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
                disabled={busy || !activeKey}
                className="block w-full rounded-lg border border-border px-2.5 py-1.5 text-left text-xs text-fg/75 hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {state.history.map((m, i) => (
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
                  onClick={() => insert(m.content)}
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
            placeholder={
              activeKey
                ? "Ask, or 'now draft a reply to this thread using that context'"
                : "Open a thread, or ask about the ones kept in context"
            }
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
