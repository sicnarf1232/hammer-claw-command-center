"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Reply from a thread via Flow B (Power Automate). Merit is the only sending
// identity. Reply-all (default when others were copied) sends back to everyone
// on the thread; toggling off replies only to the last sender.
export default function ReplyBox({
  replyToId,
  to,
  subject,
  toList,
  ccList,
}: {
  replyToId: number;
  to: string;
  subject: string;
  toList: string[];
  ccList: string[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "send">("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const hasOthers = ccList.length > 0 || toList.length > 1;
  const [replyAll, setReplyAll] = useState(hasOthers);

  const primaryTo = toList[0] ?? to;
  const recipients = replyAll
    ? { to: toList.length ? toList : [primaryTo], cc: ccList }
    : { to: [primaryTo], cc: [] as string[] };

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
          to: recipients.to,
          cc: recipients.cc,
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
        Reply sent. It will appear in this thread once the sent flow captures it.
      </div>
    );
  }

  const recipCount = recipients.to.length + recipients.cc.length;

  return (
    <div className="card mt-5 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">Reply</span>
          {hasOthers ? (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg/70">
              <input
                type="checkbox"
                checked={replyAll}
                onChange={(e) => setReplyAll(e.target.checked)}
                className="h-3.5 w-3.5 accent-[color:var(--accent)]"
              />
              Reply all
            </label>
          ) : null}
        </div>
        <button type="button" onClick={generate} disabled={busy !== ""} className="btn-ghost text-xs">
          {busy === "draft" ? "Drafting…" : "Draft with AI"}
        </button>
      </div>

      <div className="mb-2 truncate text-2xs text-muted">
        To: {recipients.to.join(", ") || "—"}
        {recipients.cc.length ? ` · Cc: ${recipients.cc.join(", ")}` : ""}
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
          Sends as Jordan.Francis@merit.com via Outlook · {recipCount} recipient
          {recipCount === 1 ? "" : "s"}
        </span>
        <button type="button" onClick={send} disabled={busy !== ""} className="btn-primary text-sm">
          {busy === "send" ? "Sending…" : replyAll && hasOthers ? "Send to all" : "Send reply"}
        </button>
      </div>
    </div>
  );
}
