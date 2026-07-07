"use client";

import { useState } from "react";
import ReplyBox, { type SuggestedDoc } from "@/components/ReplyBox";

// The thread conversation (2026-07-07 overhaul): newest message first, a clear
// internal-vs-external distinction per message, quoted history collapsed
// behind a toggle, and a Reply button on EVERY message that anchors the reply
// box (recipients derive from the chosen message, not just the latest inbound).

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
  internal: boolean; // sender is Merit-internal
  fromLabel: string;
  toLine: string | null;
  atLabel: string;
  bodyMain: string;
  bodyQuoted: string | null;
  flagged: boolean;
  attachments: ThreadMsgAttachment[];
  // Reply-all set anchored to THIS message.
  replyTo: string[];
  replyCc: string[];
}

export default function ThreadMessages({
  messages, // newest first
  subject,
  defaultAnchorId,
  suggestedDocs,
  workstream,
}: {
  messages: ThreadMsg[];
  subject: string;
  defaultAnchorId: number | null;
  suggestedDocs: SuggestedDoc[];
  workstream?: string;
}) {
  const [anchorId, setAnchorId] = useState<number | null>(defaultAnchorId);

  return (
    <div className="grid gap-3">
      {messages.map((m) => (
        <div key={m.id}>
          <MessageCard
            m={m}
            isAnchor={anchorId === m.id}
            onReply={() => setAnchorId(m.id)}
          />
          {anchorId === m.id ? (
            <div className="mt-2 border-l-2 border-accent/40 pl-3">
              <ReplyBox
                key={m.id}
                replyToId={m.id}
                to={m.fromLabel}
                subject={subject}
                toList={m.replyTo}
                ccList={m.replyCc}
                suggestedDocs={suggestedDocs}
                workstream={workstream}
              />
            </div>
          ) : null}
        </div>
      ))}
      {anchorId === null && messages.length > 0 ? (
        <p className="text-sm text-muted">
          This thread has no inbound message to reply to. Use Reply on a sent
          message to follow up with the same people.
        </p>
      ) : null}
    </div>
  );
}

function MessageCard({
  m,
  isAnchor,
  onReply,
}: {
  m: ThreadMsg;
  isAnchor: boolean;
  onReply: () => void;
}) {
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
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">{m.fromLabel}</span>
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
          {m.toLine ? (
            <div className="mt-0.5 truncate text-xs text-muted">to {m.toLine}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-2xs tabular-nums text-muted">{m.atLabel}</span>
          <button
            type="button"
            onClick={onReply}
            className={`rounded-lg border px-2 py-1 text-2xs font-semibold transition-colors ${
              isAnchor
                ? "border-transparent bg-primary text-primary-fg"
                : "border-border text-fg/70 hover:border-accent hover:text-accent"
            }`}
            title="Reply to this message (recipients follow this message)"
          >
            {isAnchor ? "Replying" : "Reply"}
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
