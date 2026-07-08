"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReplyBox, { type SuggestedDoc } from "@/components/ReplyBox";
import { INSERT_REPLY_EVENT } from "@/components/InboxBrain";

// Self-contained thread detail panel (FIGMA FIX 3 + FIX 5): fetches
// /api/inbox/thread-data and renders header, participants, AI summary,
// triage pills, unmapped-sender line, suggested attachments, the message
// list, and a pinned reply composer.

interface PersonRef {
  name: string;
  email: string;
  title: string | null;
  accountName: string | null;
  internal: boolean;
}

interface ThreadMsgAttachment {
  id: number;
  fileName: string | null;
  sizeBytes: number | null;
  isImage: boolean;
  isPdf: boolean;
  hasBlob: boolean;
}

interface ThreadMsg {
  id: number;
  direction: "inbound" | "outbound";
  internal: boolean;
  from: PersonRef;
  recipients: PersonRef[];
  atLabel: string;
  bodyMain: string;
  bodyQuoted: string | null;
  bodyHtml: string | null;
  flagged: boolean;
  attachments: ThreadMsgAttachment[];
  replyTo: string[];
  replyCc: string[];
}

interface ThreadParticipant {
  email: string;
  name: string;
}

interface ThreadTriage {
  pathway: string | null;
  reviewed: boolean;
  summary: string | null;
  model: string | null;
  aiGenerated: boolean;
  manual: boolean;
  priority: string | null;
  needsReply: boolean;
}

interface DocSuggestion extends SuggestedDoc {
  [key: string]: unknown;
}

interface ThreadData {
  ok: boolean;
  subject: string;
  count: number;
  messageIds: number[];
  latestMessageId: number;
  acct: { name: string; slug: string } | null;
  flagged: boolean;
  archived: boolean;
  threadMsgs: ThreadMsg[];
  triage: ThreadTriage | null;
  externalParticipants: ThreadParticipant[];
  internalParticipants: ThreadParticipant[];
  senderSuggestion: {
    address: string;
    name: string | null;
    suggestion: { accountId: number; name: string } | null;
    accounts: { id: number; name: string }[];
  } | null;
  docSuggestions: DocSuggestion[];
  quoteHref: string | null;
}

// Pathway meta (labels/colors), mirrored from components/InboxList.tsx.
const PATHWAY: Record<string, { label: string; color: string }> = {
  "needs-reply": { label: "Needs reply", color: "var(--due)" },
  "quote-request": { label: "Quote", color: "var(--accent)" },
  "quality-pcn": { label: "Quality / PCN", color: "var(--warm)" },
  logistics: { label: "Logistics", color: "var(--info, #5145e6)" },
  fyi: { label: "FYI", color: "var(--ink-3)" },
  noise: { label: "Noise", color: "var(--ink-3)" },
};

const PATHWAY_ORDER = ["needs-reply", "quote-request", "quality-pcn", "logistics", "fyi", "noise"];

async function post(url: string, body: unknown): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export default function ThreadDetail({
  threadKey,
  onClose,
}: {
  threadKey: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Optimistic UI state layered over the fetched payload.
  const [flagged, setFlagged] = useState(false);
  const [archived, setArchived] = useState(false);
  const [pathway, setPathway] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [senderLinked, setSenderLinked] = useState(false);
  const [linkAccountId, setLinkAccountId] = useState<string>("");
  const [linking, setLinking] = useState(false);

  const [summaryOpen, setSummaryOpen] = useState(true);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pickedDocIds, setPickedDocIds] = useState<Set<number>>(new Set());

  const [replyTargetId, setReplyTargetId] = useState<number | null>(null);
  // Closed until Jordan hits Reply; opening scrolls the composer into view.
  const [composerOpen, setComposerOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  function openComposer(targetId: number) {
    setReplyTargetId(targetId);
    setComposerOpen(true);
    setTimeout(
      () => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      60,
    );
  }
  const [preset, setPreset] = useState<{ html: string; nonce: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/inbox/thread-data?key=${encodeURIComponent(threadKey)}`);
      const j = (await r.json()) as ThreadData;
      if (!r.ok || !j.ok) throw new Error("Could not load the thread.");
      setData(j);
      // Tell the Ask Brain panel whose context this thread carries.
      window.dispatchEvent(
        new CustomEvent("hc-thread-scope", {
          detail: { key: threadKey, account: j.acct?.name ?? null },
        }),
      );
      setFlagged(j.flagged);
      setArchived(j.archived);
      setPathway(j.triage?.pathway ?? null);
      setReviewed(Boolean(j.triage?.reviewed));
      setSenderLinked(false);
      setLinkAccountId(
        j.senderSuggestion?.suggestion ? String(j.senderSuggestion.suggestion.accountId) : "",
      );
      const target =
        j.threadMsgs.find((m) => m.direction === "inbound") ?? j.threadMsgs[0] ?? null;
      setReplyTargetId(target?.id ?? null);
      setPreset(null);
      setPickedDocIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the thread.");
    } finally {
      setLoading(false);
    }
  }, [threadKey]);

  useEffect(() => {
    load();
  }, [load]);

  // The brain panel can push a draft into the composer from outside.
  useEffect(() => {
    const onInsert = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text !== "string" || !text) return;
      const html = text
        .split(/\n{2,}/)
        .map(
          (p) =>
            `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
        )
        .join("");
      setPreset((prev) => ({ html, nonce: (prev?.nonce ?? 0) + 1 }));
      setComposerOpen(true);
    };
    window.addEventListener(INSERT_REPLY_EVENT, onInsert);
    return () => window.removeEventListener(INSERT_REPLY_EVENT, onInsert);
  }, []);

  // The thread list keeps rows in sync with what happens here: marking a
  // thread reviewed pulls it out of Needs attention right away, archiving
  // pulls it out of every live folder.
  function announce(change: Record<string, unknown>) {
    window.dispatchEvent(
      new CustomEvent("hc-thread-update", { detail: { key: threadKey, ...change } }),
    );
  }

  function toggleFlag() {
    const next = !flagged;
    setFlagged(next);
    announce({ flagged: next });
    post("/api/inbox/thread-action", { key: threadKey, action: next ? "flag" : "unflag" }).then(
      (ok) => {
        if (!ok) {
          setFlagged(!next);
          announce({ flagged: !next });
        }
      },
    );
  }

  function toggleArchive() {
    const next = !archived;
    setArchived(next);
    announce({ archived: next });
    post("/api/inbox/thread-action", {
      key: threadKey,
      action: next ? "archive" : "unarchive",
    }).then((ok) => {
      if (!ok) {
        setArchived(!next);
        announce({ archived: !next });
      }
    });
  }

  function setPathwayOptimistic(p: string) {
    const prev = pathway;
    setPathway(p);
    post("/api/inbox/triage-set", { key: threadKey, pathway: p }).then((ok) => {
      if (!ok) setPathway(prev);
    });
  }

  function toggleReviewed() {
    const next = !reviewed;
    setReviewed(next);
    announce({ reviewed: next });
    post("/api/inbox/triage-set", { key: threadKey, reviewed: next }).then((ok) => {
      if (!ok) {
        setReviewed(!next);
        announce({ reviewed: !next });
      }
    });
  }

  async function linkSender() {
    const s = data?.senderSuggestion;
    if (!s || !linkAccountId) return;
    setLinking(true);
    const ok = await post("/api/inbox/link-sender", {
      address: s.address,
      accountId: Number(linkAccountId),
      name: s.name ?? s.address,
    });
    setLinking(false);
    if (ok) setSenderLinked(true);
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 p-4">
        <div className="h-8 w-2/3 rounded-lg bg-surface2" />
        <div className="h-4 w-1/2 rounded bg-surface2" />
        <div className="h-24 rounded-xl bg-surface2" />
        <div className="h-40 rounded-xl bg-surface2" />
        <div className="h-40 rounded-xl bg-surface2" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted">{error ?? "Could not load the thread."}</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface2"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg/70 hover:text-fg"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const externalSet = new Set(data.externalParticipants.map((p) => p.email.toLowerCase()));
  const replyTarget =
    data.threadMsgs.find((m) => m.id === replyTargetId) ??
    data.threadMsgs.find((m) => m.direction === "inbound") ??
    data.threadMsgs[0];
  const externalRecipientCount = replyTarget
    ? [...replyTarget.replyTo, ...replyTarget.replyCc].filter((a) =>
        externalSet.has(a.toLowerCase()),
      ).length
    : 0;

  const whoLine =
    data.acct?.name ??
    data.externalParticipants.map((p) => p.name).slice(0, 3).join(", ") ??
    "";

  // Jump between emails in the thread without scrolling through each full
  // body. Finds the topmost visible card and scrolls to its neighbor.
  function jumpMsg(dir: 1 | -1) {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-msgcard]"));
    if (!cards.length) return;
    const threshold = 100;
    let current = cards.findIndex((el) => el.getBoundingClientRect().top >= threshold - 8);
    if (current === -1) current = cards.length - 1;
    const idx = Math.min(Math.max(current + dir, 0), cards.length - 1);
    cards[idx]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="relative">
      {/* 1. Sticky header */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface pb-2 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-border px-2 py-1 text-sm text-fg/70 hover:text-fg"
            title="Back to the inbox"
          >
            ←
          </button>
          <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-fg">
            {data.subject}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {data.threadMsgs.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => jumpMsg(-1)}
                  className="rounded-lg border border-border px-2 py-1 text-xs text-fg/70 hover:text-fg"
                  title="Previous email in thread"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => jumpMsg(1)}
                  className="rounded-lg border border-border px-2 py-1 text-xs text-fg/70 hover:text-fg"
                  title="Next email in thread"
                >
                  ↓
                </button>
              </>
            ) : null}
            <Link
              href={`/compose?forwardId=${data.latestMessageId}`}
              className="rounded-lg border border-border px-2 py-1 text-xs text-fg/70 hover:text-fg"
              title="Forward the latest message"
            >
              ↪
            </Link>
            <button
              type="button"
              onClick={toggleFlag}
              className={`rounded-lg border px-2 py-1 text-xs ${
                flagged ? "border-accent text-accent" : "border-border text-fg/70 hover:text-fg"
              }`}
              title={flagged ? "Unflag thread" : "Flag thread"}
            >
              🚩
            </button>
            <button
              type="button"
              onClick={toggleArchive}
              className={`rounded-lg border px-2 py-1 text-xs ${
                archived ? "border-accent text-accent" : "border-border text-fg/70 hover:text-fg"
              }`}
              title={archived ? "Unarchive thread" : "Archive thread"}
            >
              🗄
            </button>
          </div>
        </div>
        <div className="mt-1 truncate pl-9 text-xs text-muted">
          {data.count} {data.count === 1 ? "message" : "messages"}
          {whoLine ? ` · ${whoLine}` : ""}
          {archived ? " · Archived" : ""}
        </div>
      </div>

      {/* 2. Participant strip */}
      <ParticipantStrip
        external={data.externalParticipants}
        internal={data.internalParticipants}
      />

      {/* 3. AI summary */}
      {data.triage?.summary ? (
        <div className="mt-3 rounded-xl bg-accentSoft/40 p-3">
          <button
            type="button"
            onClick={() => setSummaryOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-2xs font-semibold uppercase tracking-wide text-accent">
              ✦ AI Summary
            </span>
            <span className="text-xs text-muted">{summaryOpen ? "▾" : "▸"}</span>
          </button>
          {summaryOpen ? (
            <div className="mt-1.5">
              <p className="text-sm leading-relaxed text-fg/85">{data.triage.summary}</p>
              {data.triage.aiGenerated ? (
                <p className="mt-1 text-2xs text-muted">
                  Generated by {data.triage.model ?? "AI"}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 4. Triage pills + Mark reviewed */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PATHWAY_ORDER.map((p) => {
          const meta = PATHWAY[p];
          const active = pathway === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPathwayOptimistic(p)}
              className={`rounded-full px-2.5 py-1 text-2xs font-semibold transition-colors ${
                active ? "text-white" : "border border-border text-fg/70 hover:text-fg"
              }`}
              style={active ? { background: meta.color } : undefined}
            >
              {meta.label}
            </button>
          );
        })}
        <span className="flex-1" />
        <button
          type="button"
          onClick={toggleReviewed}
          className={`shrink-0 rounded-full px-2.5 py-1 text-2xs font-semibold transition-colors ${
            reviewed
              ? "bg-accentSoft text-accent"
              : "border border-border text-fg/70 hover:text-fg"
          }`}
        >
          {reviewed ? "✓ Reviewed" : "Mark reviewed"}
        </button>
      </div>

      {/* 5. Unmapped sender, one inline line (FIX 5) */}
      {data.senderSuggestion && !senderLinked ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>⚠ Sender not linked to an account.</span>
          <select
            value={linkAccountId}
            onChange={(e) => setLinkAccountId(e.target.value)}
            className="rounded-lg border border-border bg-surface px-1.5 py-0.5 text-xs text-fg"
          >
            <option value="">Choose account…</option>
            {data.senderSuggestion.accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={linkSender}
            disabled={!linkAccountId || linking}
            className="rounded-lg border border-border px-2 py-0.5 text-xs font-semibold text-accent hover:bg-accentSoft disabled:opacity-50"
          >
            {linking ? "Linking…" : "Link"}
          </button>
        </div>
      ) : null}

      {/* 6. Suggested attachments */}
      {data.docSuggestions.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAttachOpen((o) => !o)}
            className="text-xs font-medium text-fg/70 hover:text-fg"
          >
            📎 Suggested attachments ({data.docSuggestions.length}) {attachOpen ? "▾" : "▸"}
          </button>
          {attachOpen ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {data.docSuggestions.map((d) => {
                const picked = pickedDocIds.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setPickedDocIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(d.id)) next.delete(d.id);
                        else next.add(d.id);
                        return next;
                      });
                      setComposerOpen(true);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-2xs transition-colors ${
                      picked
                        ? "border-accent bg-accentSoft text-accent"
                        : "border-border text-fg/70 hover:text-fg"
                    }`}
                    title="Queue this document for the reply"
                  >
                    {picked ? "✓ " : ""}
                    {d.title} · {d.docType}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 7. Messages, newest first */}
      <div className="mt-4 grid gap-3">
        {data.threadMsgs.map((m) => (
          <div key={m.id} data-msgcard style={{ scrollMarginTop: 96 }}>
            <DetailMessageCard
              m={m}
              isReplyTarget={replyTarget?.id === m.id}
              onReply={() => openComposer(m.id)}
            />
          </div>
        ))}
      </div>

      {/* 8. Reply composer pinned at bottom */}
      {replyTarget ? (
        <div ref={composerRef} className="mt-4 rounded-2xl border border-border bg-surface p-3">
          <button
            type="button"
            onClick={() => setComposerOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-fg">
              Reply to {replyTarget.from.name}
            </span>
            <span className="text-xs text-muted">{composerOpen ? "▾" : "▸"}</span>
          </button>
          {composerOpen ? (
            <div className="mt-2">
              {/* What this reply is anchored to, so the context rides along. */}
              <div className="mb-2 rounded-lg border-l-2 border-accent bg-surface2 px-2.5 py-1.5">
                <div className="text-2xs font-semibold text-muted">
                  Replying to {replyTarget.from.name} · {replyTarget.atLabel}
                </div>
                {replyTarget.bodyMain ? (
                  <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-fg/70">
                    {replyTarget.bodyMain}
                  </div>
                ) : null}
              </div>
              {externalRecipientCount > 0 ? (
                <p className="mb-2 text-xs font-medium text-warm">
                  {externalRecipientCount} external{" "}
                  {externalRecipientCount === 1 ? "recipient" : "recipients"}, review before
                  sending
                </p>
              ) : null}
              <ReplyBox
                key={replyTarget.id}
                replyToId={replyTarget.id}
                to={replyTarget.from.name}
                subject={data.subject}
                toList={replyTarget.replyTo}
                ccList={replyTarget.replyCc}
                suggestedDocs={data.docSuggestions.map(({ id, title, docType }) => ({
                  id,
                  title,
                  docType,
                }))}
                preset={preset}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ParticipantStrip({
  external,
  internal,
}: {
  external: ThreadParticipant[];
  internal: ThreadParticipant[];
}) {
  if (!external.length && !internal.length) return null;
  const renderGroup = (label: string, people: ThreadParticipant[], color: string) => {
    const shown = people.slice(0, 4);
    const extra = people.length - shown.length;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-muted">
          {label}:
        </span>
        {shown.map((p) => (
          <span key={p.email} className="inline-flex items-center gap-1 text-xs text-fg/80">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <span className="max-w-32 truncate">{p.name}</span>
          </span>
        ))}
        {extra > 0 ? <span className="text-2xs text-muted">+{extra}</span> : null}
      </span>
    );
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden">
      {external.length ? renderGroup("External", external, "var(--due)") : null}
      {external.length && internal.length ? (
        <span className="h-3 w-px shrink-0 bg-border" />
      ) : null}
      {internal.length ? renderGroup("Internal", internal, "var(--accent2)") : null}
    </div>
  );
}

// Name-first person chip with a hover contact card.
function PersonChip({ p, muted = false }: { p: PersonRef; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="group/person relative inline-block" onMouseLeave={() => setOpen(false)}>
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

const CLAMP_THRESHOLD = 200;
const MAX_RECIPIENT_CHIPS = 3;

// Render the original HTML email in a sandboxed iframe: no scripts can run
// (sandbox omits allow-scripts), links open in a new tab, and the frame sizes
// itself to the content. This is what preserves tables and inline images.
function EmailHtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const doc = useMemo(() => buildEmailDoc(html), [html]);
  return (
    <iframe
      ref={ref}
      sandbox="allow-same-origin"
      srcDoc={doc}
      title="Email content"
      className="w-full rounded-xl border border-border bg-white"
      style={{ height }}
      onLoad={() => {
        try {
          const body = ref.current?.contentDocument?.body;
          if (body) setHeight(Math.min(Math.max(body.scrollHeight + 24, 120), 2400));
        } catch {}
      }}
    />
  );
}

function buildEmailDoc(html: string): string {
  const styles = Array.from(html.matchAll(/<style[\s\S]*?<\/style>/gi))
    .map((m) => m[0])
    .join("\n");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const inner = bodyMatch ? bodyMatch[1] : html;
  return [
    '<!doctype html><html><head><meta charset="utf-8"><base target="_blank">',
    styles,
    "<style>",
    'body { margin: 14px; font: 14px/1.55 -apple-system, "Segoe UI", Arial, sans-serif; color: #111; background: #fff; word-break: break-word; }',
    "img { max-width: 100%; height: auto; }",
    "table { max-width: 100%; }",
    "</style></head><body>",
    inner,
    "</body></html>",
  ].join("");
}

function DetailMessageCard({
  m,
  isReplyTarget,
  onReply,
}: {
  m: ThreadMsg;
  isReplyTarget: boolean;
  onReply: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const hasRich = Boolean(m.bodyHtml);
  const clampable = m.bodyMain.length > CLAMP_THRESHOLD;
  const shownRecipients = m.recipients.slice(0, MAX_RECIPIENT_CHIPS);
  const extraRecipients = m.recipients.length - shownRecipients.length;

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
              {shownRecipients.map((r, i) => (
                <span key={r.email} className="inline-flex items-center">
                  <PersonChip p={r} muted />
                  {i < shownRecipients.length - 1 ? <span>,</span> : null}
                </span>
              ))}
              {extraRecipients > 0 ? (
                <span className="text-2xs text-muted">+{extraRecipients}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-2xs tabular-nums text-muted">{m.atLabel}</span>
          <button
            type="button"
            onClick={onReply}
            className={`rounded-lg border px-2 py-1 text-2xs font-semibold transition-colors ${
              isReplyTarget
                ? "border-accent text-accent"
                : "border-border text-fg/70 hover:border-accent hover:text-accent"
            }`}
            title="Reply to this message (recipients follow this message)"
          >
            Reply
          </button>
          <Link
            href={`/compose?forwardId=${m.id}`}
            className="rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-fg/70 transition-colors hover:border-accent hover:text-accent"
            title="Forward this message (the original rides along below your note)"
          >
            Forward
          </Link>
        </div>
      </div>

      {m.bodyMain || hasRich ? (
        <div className="mt-3">
          {/* Expanded + HTML available: the real email, tables and images
              included, in an isolated no-script frame. Otherwise the cleaned
              plain text, clamped until opened. */}
          {hasRich && expanded ? (
            <EmailHtmlFrame html={m.bodyHtml!} />
          ) : (
            <div
              className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-fg/85 ${
                (clampable || hasRich) && !expanded ? "line-clamp-3" : ""
              }`}
            >
              {m.bodyMain || "(no text body)"}
            </div>
          )}
          {clampable || hasRich ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 text-2xs font-medium text-accent hover:underline"
            >
              {expanded ? "Show less" : hasRich ? "Show full email" : "Show more"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 text-sm italic text-muted">(no text body)</div>
      )}

      {m.bodyQuoted && !(hasRich && expanded) ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowQuoted((s) => !s)}
            className="text-2xs font-medium text-muted hover:text-fg"
          >
            {showQuoted ? "Hide signature & quoted text" : "··· Signature & quoted text"}
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
