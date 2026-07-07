"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeftIcon, SparkIcon } from "./icons";

// The inbox brain: ONE persistent chat that lives across the whole Inbox tab
// (list, folders, and threads). State survives navigation via the inbox layout
// AND page reloads via sessionStorage; a sync event keeps the layout panel and
// the focus-mode panel on the same conversation. Threads are added to context
// explicitly; the currently open thread is always sent along, so "now draft a
// reply to this newly opened thread" just works.

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  steps?: string[]; // tool calls the agent made (search/read/brain)
}

interface BrainState {
  history: ChatMsg[];
  context: Array<{ key: string; label: string }>;
}

const STORE_KEY = "hc-inbox-brain";
const OPEN_KEY = "brain-open";
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
  collapsible = false,
}: {
  // Focus mode passes a direct callback; the layout panel dispatches the
  // insert event that the thread view listens for.
  onUseAsReply?: (text: string) => void;
  // The layout panel collapses to a 36px icon strip; focus mode stays fixed.
  collapsible?: boolean;
}) {
  const pathname = usePathname();
  const activeKey = activeThreadKeyFromPath(pathname ?? "");
  const [state, setState] = useState<BrainState>({ history: [], context: [] });
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate + stay in sync with the other mounted instance and the nav toggle.
  useEffect(() => {
    const sync = () => {
      setState(loadState());
      if (collapsible) {
        try {
          setOpen(localStorage.getItem(OPEN_KEY) !== "false");
        } catch {}
      }
    };
    sync();
    window.addEventListener(SYNC_EVENT, sync);
    return () => window.removeEventListener(SYNC_EVENT, sync);
  }, [collapsible]);

  function setOpenState(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "true" : "false");
    } catch {}
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  }

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
          history: [
            ...history,
            {
              role: "assistant",
              content: data.text ?? "",
              steps: Array.isArray(data.steps) && data.steps.length ? data.steps : undefined,
            },
          ],
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

  if (collapsible && !open) {
    return (
      <div
        className="flex h-full min-h-0 flex-col items-center rounded-2xl border border-border bg-surface py-2"
        style={{ width: 36, transition: "width .22s ease" }}
      >
        <button
          type="button"
          onClick={() => setOpenState(true)}
          title="Open Ask Brain"
          aria-label="Open Ask Brain"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-accent hover:bg-accentSoft"
        >
          <SparkIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-surface"
      style={collapsible ? { width: 300, transition: "width .22s ease" } : undefined}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="eyebrow text-muted">Ask Brain</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={newChat}
            className="rounded-lg border border-border px-2 py-0.5 text-2xs text-fg/70 hover:text-fg"
          >
            New chat
          </button>
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpenState(false)}
              title="Collapse Ask Brain"
              aria-label="Collapse Ask Brain"
              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-fg"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
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
              One chat across your WHOLE inbox: it can search all mail, read
              any thread, and pull facts from your knowledge base. Try:
            </p>
            {[
              "What emails still need a reply from me this week?",
              "Summarize this thread and what they need from me",
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
        {state.history.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            {m.steps?.length ? (
              <div className="mb-1 space-y-0.5">
                {m.steps.map((st, j) => (
                  <div key={j} className="truncate text-2xs text-muted">🔎 {st}</div>
                ))}
              </div>
            ) : null}
            {m.role === "user" ? (
              <div className="inline-block max-w-[95%] whitespace-pre-wrap rounded-xl bg-hi px-3 py-2 text-left text-xs leading-relaxed text-fg">
                {m.content}
              </div>
            ) : (
              <div className="flex items-start gap-1.5">
                <SparkIcon className="mt-2 h-3.5 w-3.5 shrink-0 text-accent" />
                <div className="min-w-0">
                  <div className="inline-block max-w-full whitespace-pre-wrap rounded-xl bg-accentSoft px-3 py-2 text-left text-xs leading-relaxed text-fg/85">
                    {m.content}
                  </div>
                  {m.content ? (
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
              </div>
            )}
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
                : "Ask anything: it can search your whole inbox and your records"
            }
            className="input min-h-[3rem] flex-1 resize-none px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={busy || !input.trim()}
            className="btn-primary text-xs disabled:opacity-60"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
