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

const WORKSTREAM_OPTIONS = ["merit", "nextech", "sloan", "personal"];

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

  async function createOutlookDraft() {
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
      if (!res.ok) setReplyErr(data.error ?? "Could not create draft.");
      else {
        setReplyMsg("Draft created in Outlook. Review and send it there.");
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
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900">
            {email.subject || "(no subject)"}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {email.fromName || email.fromEmail || "Unknown"}
            {email.fromEmail && email.fromName ? ` · ${email.fromEmail}` : ""}
            {email.receivedAt
              ? ` · ${new Date(email.receivedAt).toLocaleString()}`
              : ""}
            {email.hasAttachments ? " · has attachments" : ""}
          </div>
        </div>
        <span
          className={`chip shrink-0 ${
            filed
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-500"
          }`}
        >
          {email.status}
        </span>
      </div>

      {email.bodyPreview && (
        <p className="mt-2 line-clamp-3 text-sm text-slate-600">
          {email.bodyPreview}
        </p>
      )}

      {filed ? (
        <div className="mt-3 text-xs text-emerald-700">
          Filed to <code className="text-xs">{email.filedPath}</code>
        </div>
      ) : (
        <>
          <div className="mt-2 text-xs text-slate-400">
            Suggestion: {suggestion.reason}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={workstream}
              onChange={(e) => setWorkstream(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
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
              className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              onClick={file}
              disabled={busy}
              className="rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Filing…" : "File to vault"}
            </button>
            <button
              onClick={archive}
              disabled={busy}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Dismiss
            </button>
            {email.webLink && (
              <a
                href={email.webLink}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-slate-500 underline"
              >
                Open in Outlook
              </a>
            )}
          </div>
        </>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {message && <p className="mt-2 text-xs text-emerald-700">{message}</p>}

      <div className="mt-3 border-t border-slate-100 pt-3">
        <button
          onClick={() => setShowReply((v) => !v)}
          className="text-sm font-medium text-slate-700 hover:underline"
        >
          {showReply ? "Hide reply" : "Reply"}
        </button>
        {showReply && (
          <div className="mt-2 grid gap-2">
            <input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional: how should the AI draft this? (e.g. confirm dates, decline politely)"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={generateDraft}
                disabled={replyBusy}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {replyBusy ? "Working…" : "Draft with AI"}
              </button>
              <span className="text-xs text-slate-400">
                from-identity: {workstream || "pick a workstream above"}
              </span>
            </div>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Reply body. Edit freely before creating the Outlook draft."
              rows={8}
              className="rounded-md border border-slate-300 px-2 py-1 font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={createOutlookDraft}
                disabled={replyBusy}
                className="rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Create Outlook draft
              </button>
              <span className="text-xs text-slate-400">
                Creates a draft only. You send it from Outlook.
              </span>
            </div>
            {replyErr && <p className="text-xs text-red-600">{replyErr}</p>}
            {replyMsg && <p className="text-xs text-emerald-700">{replyMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
