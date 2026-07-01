"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Reply from a thread via Flow B (Power Automate). The body is a rich WYSIWYG
// editor: "Draft with AI" fills it with formatted HTML in Jordan's voice, and the
// prompt-in box lets him steer the draft for complex replies. Reply-all defaults
// on when others were copied.
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
  const editorRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"" | "draft" | "send">("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [steer, setSteer] = useState("");
  const [empty, setEmpty] = useState(true);
  const hasOthers = ccList.length > 0 || toList.length > 1;
  const [replyAll, setReplyAll] = useState(hasOthers);

  const primaryTo = toList[0] ?? to;
  const recipients = replyAll
    ? { to: toList.length ? toList : [primaryTo], cc: ccList }
    : { to: [primaryTo], cc: [] as string[] };

  function syncEmpty() {
    const html = editorRef.current?.innerHTML ?? "";
    setEmpty(!editorRef.current?.textContent?.trim() && !/<(img|ul|ol|table)/i.test(html));
  }

  function exec(cmd: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false);
    syncEmpty();
  }

  async function generate() {
    setBusy("draft");
    setError(null);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: replyToId,
          mode: "generate",
          workstream: "merit",
          instructions: steer.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Drafting failed.");
      else if (editorRef.current) {
        editorRef.current.innerHTML = data.body ?? "";
        syncEmpty();
      }
    } catch {
      setError("Drafting failed.");
    } finally {
      setBusy("");
    }
  }

  async function send() {
    const html = editorRef.current?.innerHTML ?? "";
    if (empty || !html.trim()) {
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
          bodyHtml: html,
          subject: `RE: ${subject}`,
          to: recipients.to,
          cc: recipients.cc,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Send failed.");
      else {
        setSent(true);
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
        Draft created in Outlook. It will appear in this thread once the sent flow captures it.
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
      </div>

      <div className="mb-2 truncate text-2xs text-muted">
        To: {recipients.to.join(", ") || "—"}
        {recipients.cc.length ? ` · Cc: ${recipients.cc.join(", ")}` : ""}
      </div>

      {/* Prompt-in: steer the AI for complex replies. */}
      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
          placeholder="Tell the AI how to reply (optional): push back on the lead time, keep it warm…"
          className="input flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && busy === "") {
              e.preventDefault();
              generate();
            }
          }}
        />
        <button
          type="button"
          onClick={generate}
          disabled={busy !== ""}
          className="btn-ghost whitespace-nowrap text-xs"
        >
          {busy === "draft" ? "Drafting…" : "✨ Draft with AI"}
        </button>
      </div>

      {/* Formatting toolbar for the WYSIWYG body. */}
      <div className="mb-1.5 flex items-center gap-1 text-xs">
        <FmtBtn label="B" title="Bold" onClick={() => exec("bold")} bold />
        <FmtBtn label="I" title="Italic" onClick={() => exec("italic")} italic />
        <FmtBtn label="• List" title="Bulleted list" onClick={() => exec("insertUnorderedList")} />
        <FmtBtn label="1. List" title="Numbered list" onClick={() => exec("insertOrderedList")} />
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncEmpty}
        data-placeholder="Write your reply, or draft one with AI and edit it."
        className="reply-editor input min-h-[9rem] w-full resize-y overflow-auto text-sm leading-relaxed"
      />

      {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-2xs text-muted">
          Creates a draft as Jordan.Francis@merit.com in Outlook · {recipCount} recipient
          {recipCount === 1 ? "" : "s"}
        </span>
        <button type="button" onClick={send} disabled={busy !== ""} className="btn-primary text-sm">
          {busy === "send" ? "Creating draft…" : replyAll && hasOthers ? "Draft to all" : "Create draft"}
        </button>
      </div>
    </div>
  );
}

function FmtBtn({
  label,
  title,
  onClick,
  bold,
  italic,
}: {
  label: string;
  title: string;
  onClick: () => void;
  bold?: boolean;
  italic?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-md border border-border px-2 py-1 text-fg/70 hover:bg-surface2 hover:text-fg ${
        bold ? "font-bold" : ""
      } ${italic ? "italic" : ""}`}
    >
      {label}
    </button>
  );
}
