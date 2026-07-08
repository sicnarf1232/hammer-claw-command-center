"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, SparkIcon } from "./icons";

// The inbox brain: ONE persistent chat that lives across the whole Inbox tab.
// State survives navigation via the inbox layout AND page reloads via
// localStorage. Selection is panel state now (not a route), so the workspace
// announces the open thread over the hc-thread-open event and the detail
// panel announces its account over hc-thread-scope; the brain scopes itself
// to whatever is open unless Jordan clears the scope.

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  steps?: string[]; // tool calls the agent made (search/read/brain)
}

interface BrainState {
  history: ChatMsg[];
  context: Array<{ key: string; label: string }>;
}

const STORE_KEY = "brain-messages";
const OPEN_KEY = "brain-open";
const SYNC_EVENT = "hc-brain-sync";
const THREAD_EVENT = "hc-thread-open";
const SCOPE_EVENT = "hc-thread-scope";
export const INSERT_REPLY_EVENT = "hc-insert-reply";

function loadState(): BrainState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as BrainState;
  } catch {}
  return { history: [], context: [] };
}

function saveState(s: BrainState) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {}
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

function threadKeyFromLocation(): string | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    const selected = sp.get("selected");
    if (selected) return selected;
    const m = window.location.pathname.match(/^\/inbox\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export default function InboxBrain({
  onUseAsReply,
  collapsible = false,
}: {
  onUseAsReply?: (text: string) => void;
  // The layout panel collapses to a 44px icon strip; other mounts stay fixed.
  collapsible?: boolean;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [scopeAccount, setScopeAccount] = useState<string | null>(null);
  const [scopeCleared, setScopeCleared] = useState(false);
  const [state, setState] = useState<BrainState>({ history: [], context: [] });
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate, follow the open thread, and stay in sync with the nav toggle.
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
    setActiveKey(threadKeyFromLocation());
    const onThread = (e: Event) => {
      const key = (e as CustomEvent).detail as string | null;
      setActiveKey(key);
      setScopeCleared(false);
      if (!key) setScopeAccount(null);
    };
    const onScope = (e: Event) => {
      const d = (e as CustomEvent).detail as { key: string; account: string | null };
      setScopeAccount(d?.account ?? null);
    };
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener(THREAD_EVENT, onThread);
    window.addEventListener(SCOPE_EVENT, onScope);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener(THREAD_EVENT, onThread);
      window.removeEventListener(SCOPE_EVENT, onScope);
    };
  }, [collapsible]);

  // Below 1100px the panel gives the inbox its room back automatically.
  useEffect(() => {
    if (!collapsible) return;
    const check = () => {
      if (window.innerWidth < 1100) {
        setOpen(false);
      } else {
        try {
          setOpen(localStorage.getItem(OPEN_KEY) !== "false");
        } catch {}
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [collapsible]);

  // Cmd+K / Ctrl+K: open the panel and focus the ask box from anywhere.
  useEffect(() => {
    if (!collapsible) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenState(true);
        setTimeout(() => inputRef.current?.focus(), 60);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const label = (scopeAccount ?? document.title.replace(/ [-|·].*$/, "")).slice(0, 40) || activeKey;
    update({ ...state, context: [...state.context, { key: activeKey, label }] });
  }

  function removeContext(key: string) {
    update({ ...state, context: state.context.filter((c) => c.key !== key) });
  }

  const scopedKey = scopeCleared ? null : activeKey;
  const scopeLabel = scopeAccount ?? (activeKey ? "open thread" : null);

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
          activeThreadKey: scopedKey,
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
      <button
        type="button"
        onClick={() => setOpenState(true)}
        title="Open Ask Brain"
        aria-label="Open Ask Brain"
        className="flex h-full min-h-0 flex-col items-center rounded-2xl border border-border bg-surface py-2.5 transition-colors hover:border-accent/40"
        style={{ width: 44, transition: "width .22s ease" }}
      >
        <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-accentSoft text-accent">
          <SparkIcon className="h-4 w-4" />
          {state.history.length > 0 ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent)" }}
            />
          ) : null}
        </span>
        <span
          className="mt-3 text-[10px] font-bold uppercase tracking-[0.13em] text-muted"
          style={{ writingMode: "vertical-rl" }}
        >
          Brain
        </span>
        <span className="mt-auto text-muted">
          <ChevronLeftIcon className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-surface"
      style={collapsible ? { width: 320, transition: "width .22s ease" } : undefined}
    >
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <SparkIcon className="h-3.5 w-3.5 text-accent" />
            Brain
          </span>
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
                title="Collapse"
                aria-label="Collapse Ask Brain"
                className="flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-fg"
              >
                <ChevronLeftIcon className="h-4 w-4 rotate-180" />
              </button>
            ) : null}
          </div>
        </div>
        {scopedKey && scopeLabel ? (
          <div className="mt-0.5 text-2xs font-medium text-accent">Scoped to: {scopeLabel}</div>
        ) : null}
      </div>

      {scopedKey && scopeAccount ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-accentSoft px-3 py-1.5 text-2xs text-accent">
          <SparkIcon className="h-3 w-3" />
          Grounded in {scopeAccount} context
        </div>
      ) : null}

      {/* Extra threads pinned into context beyond the open one. */}
      {state.context.length > 0 || (activeKey && !scopeCleared) ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
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
              title="Keep this thread in the brain's context after you move on"
            >
              + Keep in context
            </button>
          ) : null}
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {state.history.length === 0 ? (
          <div className="space-y-2 pt-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-accentSoft text-accent">
              <SparkIcon className="h-5 w-5" />
            </div>
            <div className="text-center text-xs font-semibold text-fg">Ask the brain</div>
            <p className="text-center text-2xs leading-relaxed text-muted">
              Grounded in your inbox, accounts, tasks, meetings, and documents.
              Never invented.
            </p>
            <div className="space-y-1.5 pt-1">
              {[
                "What emails still need a reply from me this week?",
                "Summarize this thread and what they need from me",
                "What did I commit to in my last meetings?",
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
          </div>
        ) : null}
        {state.history.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div
                className="max-w-[88%] whitespace-pre-wrap border border-line2 bg-hi px-3 py-2 text-[12.5px] leading-relaxed text-fg/85"
                style={{ borderRadius: "12px 12px 2px 12px" }}
              >
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start">
              <div
                className="max-w-[88%] bg-accentSoft px-3 py-2"
                style={{
                  borderRadius: "12px 12px 12px 2px",
                  border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                }}
              >
                <div className="mb-1 flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.13em] text-accent">
                  <SparkIcon className="h-2.5 w-2.5" />
                  Brain
                </div>
                <BrainText text={m.content} />
              </div>
              {m.steps?.length ? (
                <div className="mt-1 flex max-w-[88%] flex-wrap gap-1">
                  {m.steps.map((st, j) => (
                    <span
                      key={j}
                      className="max-w-full truncate rounded-md bg-surface2 px-1.5 py-px text-[9.5px] text-muted"
                      title={st}
                    >
                      {st}
                    </span>
                  ))}
                </div>
              ) : null}
              {m.content ? (
                <button
                  type="button"
                  onClick={() => insert(m.content)}
                  className="mt-1 text-2xs font-semibold text-accent hover:underline"
                >
                  Insert into reply →
                </button>
              ) : null}
            </div>
          ),
        )}
        {busy ? (
          <div
            className="inline-flex items-center gap-1.5 bg-accentSoft px-3 py-1.5 text-xs text-accent"
            style={{ borderRadius: "12px 12px 12px 2px" }}
          >
            <SparkIcon className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "1.5s" }} />
            Searching your records…
          </div>
        ) : null}
        {err ? <div className="text-xs text-danger">{err}</div> : null}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        {scopedKey && scopeLabel ? (
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-2xs text-muted">
            Asking about: <span className="font-medium text-accent">{scopeLabel}</span>
            <button
              type="button"
              onClick={() => setScopeCleared(true)}
              className="text-muted underline hover:text-fg"
            >
              clear scope
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Ask the brain…"
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
        <div className="mt-1 px-1 text-[9.5px] text-muted">
          Shift+Enter for a new line · searches your whole inbox and records
        </div>
      </div>
    </div>
  );
}

// Long answers collapse to a teaser; markdown-ish lists and bold render as
// real lists and bold instead of raw dashes and asterisks.
function BrainText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 200;
  if (long && !expanded) {
    return (
      <div className="text-[12.5px] leading-[1.65] text-fg/85">
        {text.slice(0, 180).trimEnd()}…
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 block text-[11px] font-semibold text-accent hover:underline"
        >
          Show full response ↓
        </button>
      </div>
    );
  }
  return (
    <div className="text-[12.5px] leading-[1.65] text-fg/85">
      <LiteMarkdown text={text} />
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-1 block text-[11px] font-semibold text-accent hover:underline"
        >
          Collapse ↑
        </button>
      ) : null}
    </div>
  );
}

type LiteBlock = { kind: "p" | "ul" | "ol"; lines: string[] };

function parseLiteBlocks(text: string): LiteBlock[] {
  const blocks: LiteBlock[] = [];
  let cur: LiteBlock | null = null;
  const flush = () => {
    if (cur && cur.lines.length) blocks.push(cur);
    cur = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul) {
      if (cur?.kind !== "ul") flush();
      cur = cur ?? { kind: "ul", lines: [] };
      cur.lines.push(ul[1]);
    } else if (ol) {
      if (cur?.kind !== "ol") flush();
      cur = cur ?? { kind: "ol", lines: [] };
      cur.lines.push(ol[1]);
    } else {
      if (cur?.kind !== "p") flush();
      cur = cur ?? { kind: "p", lines: [] };
      cur.lines.push(line);
    }
  }
  flush();
  return blocks;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-fg">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function LiteMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseLiteBlocks(text), [text]);
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i} className="whitespace-pre-wrap">
            <Inline text={b.lines.join("\n")} />
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-0.5 pl-4">
            {b.lines.map((l, j) => (
              <li key={j}>
                <Inline text={l} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-0.5 pl-4">
            {b.lines.map((l, j) => (
              <li key={j}>
                <Inline text={l} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
