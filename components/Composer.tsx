"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RecipientField from "@/components/RecipientField";
import TaskLinkPicker, { type PickedTask } from "@/components/TaskLinkPicker";

interface UploadRef {
  kind: "upload";
  name: string;
  contentType: string;
  base64: string;
  size: number;
}

// Compose a new email or forward one and SEND it via Flow B (direct send as
// of the 2026-07-08 flow fix; it no longer leaves an Outlook draft).
// AI can draft the body in Jordan's voice;
// the prompt-in box steers it. Attachments are read in the browser and sent as
// base64 to Flow B. For a forward, Flow B keeps
// the original's attachments automatically, so these are extras.
export default function Composer({
  mode,
  forwardId,
  initialSubject,
  forwardFrom,
  initialTo,
  initialBodyHtml,
}: {
  mode: "new" | "forward";
  forwardId?: number;
  initialSubject?: string;
  forwardFrom?: string | null;
  // dev-feedback #18: landing here from a task with a known account seeds
  // the To field with that account's contact; still a plain editable
  // RecipientField underneath, so Jordan can change it freely.
  initialTo?: string;
  // dev-feedback #21: the suggested-action "Draft email to X" flow lands
  // here with a body already drafted by the AI (lib/ai.ts's draftReply, via
  // /api/tasks/draft-action-email). Same review-before-send discipline as
  // "Draft with AI" below, just pre-filled instead of requiring a second
  // click; Jordan can still edit or clear it freely before sending.
  initialBodyHtml?: string;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [to, setTo] = useState(initialTo ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [steer, setSteer] = useState("");
  const [files, setFiles] = useState<UploadRef[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<PickedTask[]>([]);
  const [busy, setBusy] = useState<"" | "draft" | "send">("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // One-time landing prefill (dev-feedback #21), not a live sync: applied
  // once on mount, then Jordan edits the contentEditable body freely from
  // there, same as "Draft with AI" filling it in below.
  useEffect(() => {
    if (initialBodyHtml && editorRef.current) {
      editorRef.current.innerHTML = initialBodyHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(cmd: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false);
  }

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const added: UploadRef[] = [];
    for (const f of Array.from(list)) {
      const base64 = await fileToBase64(f);
      if (base64) {
        added.push({
          kind: "upload",
          name: f.name,
          contentType: f.type || "application/octet-stream",
          base64,
          size: f.size,
        });
      }
    }
    setFiles((prev) => [...prev, ...added]);
    // Clear the input so picking the SAME file again still fires onChange
    // (otherwise the value is unchanged and the picker silently does nothing,
    // which reads as "the file browser won't open").
    if (fileRef.current) fileRef.current.value = "";
  }

  async function generate() {
    setBusy("draft");
    setError(null);
    try {
      const res = await fetch("/api/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          action: mode,
          workstream: "merit",
          subject,
          forwardId,
          instructions: steer.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Drafting failed.");
      else if (editorRef.current) editorRef.current.innerHTML = data.body ?? "";
    } catch {
      setError("Drafting failed.");
    } finally {
      setBusy("");
    }
  }

  async function send() {
    const html = editorRef.current?.innerHTML ?? "";
    if (!to.trim()) return setError("Add at least one recipient.");
    if (!html.trim() || !editorRef.current?.textContent?.trim())
      return setError("Write a message (or draft one with AI).");
    setBusy("send");
    setError(null);
    try {
      const res = await fetch("/api/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "send",
          action: mode,
          workstream: "merit",
          forwardId,
          to,
          cc,
          subject,
          bodyHtml: html,
          attachments: files.map((f) => ({
            kind: "upload",
            name: f.name,
            contentType: f.contentType,
            base64: f.base64,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Send failed.");
      } else {
        setDone(true);
        // dev-feedback #15: this new email has no id yet (Flow B returns no
        // message id); queue a best-effort pending link so the task<->email
        // link lands once the outbound-capture webhook sees the real row.
        if (linkedTasks.length) {
          const toList = to
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean);
          fetch("/api/emails/pending-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject,
              to: toList,
              taskIds: linkedTasks.map((t) => t.id),
            }),
          }).catch(() => {});
        }
      }
    } catch {
      setError("Send failed.");
    } finally {
      setBusy("");
    }
  }

  if (done) {
    return (
      <div className="card p-5 text-sm text-ok">
        Sent. It is in your Outlook Sent folder.
        <div className="mt-3">
          <button type="button" onClick={() => router.push("/inbox")} className="btn-outline text-sm">
            Back to inbox
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      {mode === "forward" && forwardFrom ? (
        <div className="mb-3 rounded-xl border border-border bg-surface2 p-2.5 text-xs text-muted">
          Forwarding the message from <span className="text-fg/80">{forwardFrom}</span>. Its original
          attachments are included automatically.
        </div>
      ) : null}

      <div className="space-y-2">
        <RecipientField label="To" value={to} onChange={setTo} otherFieldValue={cc} placeholder="name@company.com, another@company.com" />
        <RecipientField label="Cc" value={cc} onChange={setCc} otherFieldValue={to} placeholder="optional" />
        <Field label="Subject">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={mode === "forward" ? "FW: …" : "Subject"}
            className="input w-full text-sm"
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
          placeholder={
            mode === "forward"
              ? "How should the forward note read? (optional)"
              : "What should this email say? (optional)"
          }
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

      <div className="mb-1.5 mt-2 flex items-center gap-1 text-xs">
        <Fmt label="B" onClick={() => exec("bold")} className="font-bold" />
        <Fmt label="I" onClick={() => exec("italic")} className="italic" />
        <Fmt label="• List" onClick={() => exec("insertUnorderedList")} />
        <Fmt label="1. List" onClick={() => exec("insertOrderedList")} />
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Write your message, or draft one with AI."
        className="reply-editor input min-h-[22rem] w-full resize-y overflow-auto text-sm leading-relaxed"
      />

      {/* Attachments */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-outline inline-flex items-center gap-1.5 text-xs"
        >
          📎 Attach files
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        {files.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={i} className="chip border-border text-fg/75">
                📎 {f.name} · {kb(f.size)}
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-1.5 text-muted hover:text-danger"
                  title="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* dev-feedback #15: link this email to any number of open tasks. */}
      <TaskLinkPicker emailId={null} selected={linkedTasks} onChange={setLinkedTasks} />

      {error ? <div className="mt-3 text-xs text-danger">{error}</div> : null}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-2xs text-muted">
          Sends as Jordan.Francis@merit.com from Outlook.
        </span>
        <button type="button" onClick={send} disabled={busy !== ""} className="btn-primary text-sm">
          {busy === "send" ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs font-medium text-muted">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Fmt({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-md border border-border px-2 py-1 text-fg/70 hover:bg-surface2 hover:text-fg ${className ?? ""}`}
    >
      {label}
    </button>
  );
}

function fileToBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? "");
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function kb(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
