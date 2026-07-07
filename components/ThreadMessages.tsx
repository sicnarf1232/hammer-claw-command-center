"use client";

import { useEffect, useState } from "react";
import ReplyBox, { type SuggestedDoc } from "@/components/ReplyBox";
import InboxBrain, { INSERT_REPLY_EVENT } from "@/components/InboxBrain";

// The thread conversation (2026-07-07 overhaul, v2 after Jordan's review):
// newest first; people render as NAME chips with the address + contact card on
// hover/tap; Reply on a message enters FOCUS MODE where the thread collapses
// to a compact rail on the left and the reply composer takes the main panel.

export interface PersonRef {
  name: string; // display name (falls back to the address)
  email: string;
  title: string | null;
  accountName: string | null;
  internal: boolean;
}

export interface ThreadMsgAttachment {
  id: number;
  fileName: string | null;
  sizeBytes: number | null;
  isImage: boolean;
  isPdf: boolean;
  hasBlob: boolean;
}

export interface ThreadMsg {
  id: number;
  direction: "inbound" | "outbound";
  internal: boolean;
  from: PersonRef;
  recipients: PersonRef[];
  atLabel: string;
  bodyMain: string;
  bodyQuoted: string | null;
  flagged: boolean;
  attachments: ThreadMsgAttachment[];
  replyTo: string[];
  replyCc: string[];
}

export default function ThreadMessages({
  messages, // newest first
  subject,
  threadKey,
  suggestedDocs,
  workstream,
}: {
  messages: ThreadMsg[];
  subject: string;
  threadKey: string;
  suggestedDocs: SuggestedDoc[];
  workstream?: string;
}) {
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [preset, setPreset] = useState<{ html: string; nonce: number } | null>(null);
  const anchor = messages.find((m) => m.id === anchorId) ?? null;

  function useAsReply(text: string) {
    const html = text
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
      .join("");
    setPreset((prev) => ({ html, nonce: (prev?.nonce ?? 0) + 1 }));
  }

  // The layout's brain panel can push a draft even when no reply is open:
  // anchor the latest inbound message and prefill the composer.
  useEffect(() => {
    const onInsert = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text !== "string" || !text) return;
      setAnchorId((cur) => {
        if (cur != null) return cur;
        const latestInbound = messages.find((m) => m.direction === "inbound");
        return latestInbound?.id ?? messages[0]?.id ?? null;
      });
      useAsReply(text);
    };
    window.addEventListener(INSERT_REPLY_EVENT, onInsert);
    return () => window.removeEventListener(INSERT_REPLY_EVENT, onInsert);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // FOCUS MODE: a full-screen workspace over the content area. Left: the
  // thread collapsed to a rail. Center: the composer with the anchored message
  // pinned. Right: the thread brain (chat), which can draft into the composer.
  if (anchor) {
    return (
      <div
        className="fixed inset-y-0 right-0 z-40 overflow-auto p-3 pb-20 md:p-5 md:pb-5"
        style={{ left: "var(--nav-w, 0px)", background: "var(--bg, var(--surface))" }}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setAnchorId(null)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg/70 hover:text-fg"
            >
              ← Back to the full thread
            </button>
            <span className="min-w-0 truncate text-sm font-semibold text-fg">{subject}</span>
          </div>

          <div className="flex min-h-0 flex-1 gap-4">
            <aside className="hidden w-60 shrink-0 overflow-auto md:block">
              <div className="space-y-1.5">
                {messages.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAnchorId(m.id)}
                    className={`block w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      m.id === anchor.id
                        ? "border-accent bg-accentSoft"
                        : "border-border bg-surface hover:bg-surface2"
                    }`}
                    style={{
                      borderLeft: `3px solid ${m.internal ? "var(--accent2, var(--accent))" : "var(--warm)"}`,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-1.5">
                      <span className="truncate text-xs font-semibold text-fg">{m.from.name}</span>
                      <span className="shrink-0 text-2xs text-muted">{m.atLabel}</span>
                    </div>
                    <div className="line-clamp-2 text-2xs text-muted">{m.bodyMain || "(no text)"}</div>
                  </button>
                ))}
              </div>
            </aside>

            <div className="min-w-0 flex-1 overflow-auto">
              <div className="mb-3 rounded-xl border border-border bg-surface2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted">
                    Replying to <span className="font-semibold text-fg">{anchor.from.name}</span>
                    {anchor.direction === "outbound" ? " (your message, same audience)" : ""}
                  </span>
                  <span className="shrink-0 text-2xs text-muted">{anchor.atLabel}</span>
                </div>
                <div className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-fg/70">
                  {anchor.bodyMain || "(no text body)"}
                </div>
              </div>
              <ReplyBox
                key={anchor.id}
                replyToId={anchor.id}
                to={anchor.from.name}
                subject={subject}
                toList={anchor.replyTo}
                ccList={anchor.replyCc}
                suggestedDocs={suggestedDocs}
                workstream={workstream}
                preset={preset}
              />
            </div>

            <aside className="hidden w-80 shrink-0 lg:block">
              <InboxBrain onUseAsReply={useAsReply} />
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {messages.map((m) => (
        <MessageCard key={m.id} m={m} onReply={() => setAnchorId(m.id)} />
      ))}
    </div>
  );
}

// Name-first person chip: the address lives underneath the name in the hover
// card, together with title / account / profile link.
function PersonChip({ p, muted = false }: { p: PersonRef; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="group/person relative inline-block"
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`cursor-pointer ${
          muted ? "text-xs text-muted hover:text-fg" : "text-sm font-semibold text-fg"
        } underline-offset-2 hover:underline`}
      >
        {p.name}
      </button>
      <span
        className={`absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border border-border bg-surface p-3 shadow-elevated ${
          open ? "block" : "hidden group-hover/person:block"
        }`}
      >
        <span className="block text-sm font-semibold text-fg">{p.name}</span>
        {p.title ? <span className="mt-0.5 block text-xs text-muted">{p.title}</span> : null}
        <span className="mt-1 block break-all font-mono text-2xs text-fg/70">{p.email}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
              p.internal ? "bg-accentSoft text-accent2" : "text-warm"
            }`}
            style={p.internal ? undefined : { background: "var(--warm-soft, var(--surface-2))" }}
          >
            {p.internal ? "Merit" : p.accountName ?? "External"}
          </span>
          <a
            href={`/people/${encodeURIComponent(p.name)}`}
            className="text-2xs text-accent hover:underline"
          >
            View profile →
          </a>
        </span>
      </span>
    </span>
  );
}

function MessageCard({ m, onReply }: { m: ThreadMsg; onReply: () => void }) {
  const [showQuoted, setShowQuoted] = useState(false);
  return (
    <article
      className="card p-4"
      style={{
        borderLeft: `3px solid ${m.internal ? "var(--accent2, var(--accent))" : "var(--warm)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <PersonChip p={m.from} />
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
                m.internal ? "bg-accentSoft text-accent2" : "text-warm"
              }`}
              style={m.internal ? undefined : { background: "var(--warm-soft, var(--surface-2))" }}
            >
              {m.internal ? "Merit" : "Customer"}
            </span>
            {m.direction === "outbound" ? (
              <span className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-2xs text-fg/60">
                Sent
              </span>
            ) : null}
            {m.flagged ? <span title="Flagged">🚩</span> : null}
          </div>
          {m.recipients.length ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <span>to</span>
              {m.recipients.map((r, i) => (
                <span key={r.email} className="inline-flex items-center">
                  <PersonChip p={r} muted />
                  {i < m.recipients.length - 1 ? <span>,</span> : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-2xs tabular-nums text-muted">{m.atLabel}</span>
          <button
            type="button"
            onClick={onReply}
            className="rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-fg/70 transition-colors hover:border-accent hover:text-accent"
            title="Reply to this message (recipients follow this message)"
          >
            Reply
          </button>
        </div>
      </div>

      {m.bodyMain ? (
        <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg/85">
          {m.bodyMain}
        </div>
      ) : (
        <div className="mt-3 text-sm italic text-muted">(no text body)</div>
      )}

      {m.bodyQuoted ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowQuoted((s) => !s)}
            className="text-2xs font-medium text-muted hover:text-fg"
          >
            {showQuoted ? "Hide earlier messages" : "··· Show earlier messages"}
          </button>
          {showQuoted ? (
            <div className="mt-2 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-xs leading-relaxed text-fg/60">
              {m.bodyQuoted}
            </div>
          ) : null}
        </div>
      ) : null}

      {m.attachments.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {m.attachments.map((a) => (
            <a
              key={a.id}
              href={`/api/email-attachments/file?id=${a.id}${a.isImage || a.isPdf ? "" : "&download=1"}`}
              target="_blank"
              rel="noreferrer"
              className={`chip border-border ${
                a.hasBlob ? "text-fg/75 hover:text-accent" : "cursor-default text-fg/40"
              }`}
              title={a.hasBlob ? "Open attachment" : "Not retained"}
            >
              {a.isImage ? "🖼 " : "📎 "}
              {a.fileName || "attachment"}
              {a.sizeBytes ? ` · ${kb(a.sizeBytes)}` : ""}
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function kb(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
