"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface InboxEmail {
  id: number;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  bodyPreview: string | null;
  receivedAt: string | null;
  webLink: string | null;
  hasAttachments: boolean;
  status: string;
  filedPath: string | null;
  account: string | null;
  workstream: string | null;
}

const WORKSTREAM_OPTIONS = ["merit", "sloan", "personal"];

export default function InboxItem({
  email,
  suggestion,
}: {
  email: InboxEmail;
  suggestion: { workstream?: string; account?: string; reason: string };
}) {
  const router = useRouter();
  const [workstream, setWorkstream] = useState(
    email.workstream ?? suggestion.workstream ?? "",
  );
  const [account, setAccount] = useState(
    email.account ?? suggestion.account ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reply panel state.
  const [showReply, setShowReply] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyMsg, setReplyMsg] = useState<string | null>(null);
  const [replyErr, setReplyErr] = useState<string | null>(null);

  const filed = email.status === "filed";

  async function generateDraft() {
    setReplyErr(null);
    setReplyMsg(null);
    if (!workstream) {
      setReplyErr("Pick a workstream first (sets the from-identity).");
      return;
    }
    setReplyBusy(true);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: email.id,
          mode: "generate",
          workstream,
          instructions: instructions || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) setReplyErr(data.error ?? "Drafting failed.");
      else setReplyBody(data.body ?? "");
    } catch {
      setReplyErr("Network error.");
    } finally {
      setReplyBusy(false);
    }
  }

  async function sendReply() {
    setReplyErr(null);
    setReplyMsg(null);
    if (!workstream) {
      setReplyErr("Pick a workstream first.");
      return;
    }
    if (!replyBody.trim()) {
      setReplyErr("Write or generate a reply body first.");
      return;
    }
    setReplyBusy(true);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: email.id,
          mode: "draft",
          workstream,
          bodyText: replyBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) setReplyErr(data.error ?? "Could not send reply.");
      else {
        setReplyMsg("Reply sent.");
        router.refresh();
      }
    } catch {
      setReplyErr("Network error.");
    } finally {
      setReplyBusy(false);
    }
  }

  async function file() {
    setError(null);
    setMessage(null);
    if (!workstream) {
      setError("Pick a workstream first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/inbox/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: email.id,
          workstream,
          account: account || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Filing failed.");
      } else {
        setMessage(`Filed to ${data.path}`);
        router.refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      await fetch("/api/inbox/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: email.id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 transition-shadow hover:shadow-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-fg">
            {email.subject || "(no subject)"}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {email.fromName || email.fromEmail || "Unknown"}
            {email.fromEmail && email.fromName ? (
              <span className="font-mono"> · {email.fromEmail}</span>
            ) : (
              ""
            )}
            {email.receivedAt ? (
              <span className="tabular-nums">
                {" "}
                · {new Date(email.receivedAt).toLocaleString()}
              </span>
            ) : (
              ""
            )}
            {email.hasAttachments ? " · has attachments" : ""}
          </div>
        </div>
        <span
          className={`chip shrink-0 ${
            filed
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-surface2 text-muted"
          }`}
        >
          {email.status}
        </span>
      </div>

      {email.bodyPreview && (
        <p className="mt-2 line-clamp-3 text-sm text-fg/75">
          {email.bodyPreview}
        </p>
      )}

      {filed ? (
        <div className="mt-3 text-xs text-success">
          Filed to <code className="font-mono text-xs">{email.filedPath}</code>
        </div>
      ) : (
        <>
          <div className="mt-2 text-xs text-muted">
            Suggestion: {suggestion.reason}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={workstream}
              onChange={(e) => setWorkstream(e.target.value)}
              className="input"
            >
              <option value="">workstream…</option>
              {WORKSTREAM_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="account (optional)"
              className="input w-44"
            />
            <button
              onClick={file}
              disabled={busy}
              className="btn btn-primary disabled:opacity-50"
            >
              {busy ? "Filing…" : "File to vault"}
            </button>
            <button
              onClick={archive}
              disabled={busy}
              className="btn btn-outline disabled:opacity-50"
            >
              Dismiss
            </button>
            {email.webLink && (
              <a
                href={email.webLink}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted underline"
              >
                Open in Outlook
              </a>
            )}
          </div>
        </>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {message && <p className="mt-2 text-xs text-success">{message}</p>}

      <div className="mt-3 border-t border-border pt-3">
        <button
          onClick={() => setShowReply((v) => !v)}
          className="text-sm font-medium text-muted hover:underline"
        >
          {showReply ? "Hide reply" : "Reply"}
        </button>
        {showReply && (
          <div className="mt-2 grid gap-2">
            <input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional: how should the AI draft this? (e.g. confirm dates, decline politely)"
              className="input"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={generateDraft}
                disabled={replyBusy}
                className="btn btn-outline disabled:opacity-50"
              >
                {replyBusy ? "Working…" : "Draft with AI"}
              </button>
              <span className="text-xs text-muted">
                from-identity: {workstream || "pick a workstream above"}
              </span>
            </div>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Reply body. Edit freely before creating the Outlook draft."
              rows={8}
              className="input font-mono"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={sendReply}
                disabled={replyBusy}
                className="btn btn-primary disabled:opacity-50"
              >
                {replyBusy ? "Sending…" : "Send reply"}
              </button>
              <span className="text-xs text-muted">
                Sends the reply directly from your Merit mailbox.
              </span>
            </div>
            {replyErr && <p className="text-xs text-danger">{replyErr}</p>}
            {replyMsg && <p className="text-xs text-success">{replyMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
