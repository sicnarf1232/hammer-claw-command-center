"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Reply from a thread via Flow B (Power Automate). Merit is the only sending
// identity, so there is no workstream picker — it is fixed to "merit".
export default function ReplyBox({
  replyToId,
  to,
  subject,
}: {
  replyToId: number;
  to: string;
  subject: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "send">("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function generate() {
    setBusy("draft");
    setError(null);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: replyToId, mode: "generate", workstream: "merit" }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Drafting failed.");
      else setBody(data.body ?? "");
    } catch {
      setError("Drafting failed.");
    } finally {
      setBusy("");
    }
  }

  async function send() {
    if (!body.trim()) {
      setError("Write a reply first (or draft one with AI).");
      return;
    }
    setBusy("send");
    setError(null);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: replyToId,
          mode: "draft",
          workstream: "merit",
          bodyText: body,
          subject: `RE: ${subject}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Send failed.");
      else {
        setSent(true);
        setBody("");
        router.refresh();
      }
    } catch {
      setError("Send failed.");
    } finally {
      setBusy("");
    }
  }

  if (sent) {
    return (
      <div className="card mt-5 p-4 text-sm text-ok">
        Reply sent to {to}. It will appear in this thread once the sent flow
        captures it.
      </div>
    );
  }

  return (
    <div className="card mt-5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-fg">Reply to {to}</div>
        <button
          type="button"
          onClick={generate}
          disabled={busy !== ""}
          className="btn-ghost text-xs"
        >
          {busy === "draft" ? "Drafting…" : "Draft with AI"}
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="Write your reply, or draft one with AI and edit it."
        className="input w-full resize-y"
      />
      {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-2xs text-muted">
          Sends as Jordan.Francis@merit.com via Outlook (Flow B).
        </span>
        <button
          type="button"
          onClick={send}
          disabled={busy !== ""}
          className="btn-primary text-sm"
        >
          {busy === "send" ? "Sending…" : "Send reply"}
        </button>
      </div>
    </div>
  );
}
