"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { identityFor } from "@/lib/workstreams";
import { isWorkstream } from "@/lib/vault/types";

// Reply from a thread via Flow B (Power Automate). The body is a rich WYSIWYG
// editor: "Draft with AI" fills it with formatted HTML in Jordan's voice, and the
// prompt-in box lets him steer the draft for complex replies. Reply-all defaults
// on when others were copied.
type Attachment =
  | { key: string; label: string; ref: { kind: "document"; id: number } }
  | { key: string; label: string; ref: { kind: "upload"; name: string; contentType?: string; base64: string } };

export interface SuggestedDoc {
  id: number;
  title: string;
  docType: string;
}

export default function ReplyBox({
  replyToId,
  to,
  subject,
  toList,
  ccList,
  suggestedDocs = [],
  workstream = "merit",
  preset = null,
}: {
  replyToId: number;
  to: string;
  subject: string;
  toList: string[];
  ccList: string[];
  suggestedDocs?: SuggestedDoc[];
  // Sending identity. Only merit has a from-address today (canDraftAs guards
  // server-side); the prop exists so a Sloan address is a page-level change,
  // not a component rewrite.
  workstream?: string;
  // Externally-provided draft (thread brain "Insert into reply"). A new nonce
  // replaces the editor content.
  preset?: { html: string; nonce: number } | null;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "draft" | "send">("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [steer, setSteer] = useState("");
  const [empty, setEmpty] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const hasOthers = ccList.length > 0 || toList.length > 1;
  const [replyAll, setReplyAll] = useState(hasOthers);

  function addDoc(d: SuggestedDoc) {
    const key = `doc:${d.id}`;
    setAttachments((prev) => (prev.some((a) => a.key === key) ? prev : [...prev, { key, label: d.title, ref: { kind: "document", id: d.id } }]));
  }
  function removeAttachment(key: string) {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }
  async function onPickFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const base64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.readAsDataURL(file);
      });
      const key = `up:${file.name}:${file.size}`;
      setAttachments((prev) =>
        prev.some((a) => a.key === key)
          ? prev
          : [...prev, { key, label: file.name, ref: { kind: "upload", name: file.name, contentType: file.type || undefined, base64 } }],
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const primaryTo = toList[0] ?? to;
  const recipients = replyAll
    ? { to: toList.length ? toList : [primaryTo], cc: ccList }
    : { to: [primaryTo], cc: [] as string[] };

  useEffect(() => {
    if (preset && editorRef.current) {
      editorRef.current.innerHTML = preset.html;
      syncEmpty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

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
    setNote(null);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: replyToId,
          mode: "generate",
          workstream,
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
    setNote(null);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: replyToId,
          mode: "draft",
          workstream,
          bodyHtml: html,
          subject: `RE: ${subject}`,
          to: recipients.to,
          cc: recipients.cc,
          attachments: attachments.map((a) => a.ref),
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Send failed.");
      else {
        // Keep the reply box open for follow-ups: clear the editor, confirm, and
        // refresh so the just-sent message appears in the thread.
        if (editorRef.current) editorRef.current.innerHTML = "";
        setEmpty(true);
        setAttachments([]);
        setNote("Sent. Reply again below if you need to follow up.");
        router.refresh();
      }
    } catch {
      setError("Send failed.");
    } finally {
      setBusy("");
    }
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

      {/* Attach-to-reply: chips for chosen files + one-tap suggested docs + upload. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {attachments.map((a) => (
          <span key={a.key} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface2 px-2 py-0.5 text-2xs text-fg/80">
            📎 <span className="max-w-[160px] truncate">{a.label}</span>
            <button type="button" onClick={() => removeAttachment(a.key)} aria-label="Remove attachment" className="text-muted hover:text-danger">
              ×
            </button>
          </span>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-full border border-dashed border-line2 px-2 py-0.5 text-2xs text-muted hover:text-fg">
          + Attach file
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
      </div>

      {suggestedDocs.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-muted">Suggested:</span>
          {suggestedDocs
            .filter((d) => !attachments.some((a) => a.key === `doc:${d.id}`))
            .map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => addDoc(d)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-2xs text-fg/70 hover:border-accent hover:text-accent"
              >
                + <span className="max-w-[160px] truncate">{d.title}</span>
              </button>
            ))}
        </div>
      ) : null}

      {note ? <div className="mt-2 text-xs text-ok">{note}</div> : null}
      {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-2xs text-muted">
          Sends as{" "}
          {(isWorkstream(workstream) ? identityFor(workstream).email : null) ??
            "Jordan.Francis@merit.com"}{" "}
          · {recipCount} recipient
          {recipCount === 1 ? "" : "s"}
        </span>
        <button type="button" onClick={send} disabled={busy !== ""} className="btn-primary text-sm">
          {busy === "send" ? "Sending…" : replyAll && hasOthers ? "Send to all" : "Send reply"}
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
