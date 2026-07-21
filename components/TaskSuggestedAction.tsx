"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TaskView } from "@/lib/taskView";
import { quoteHrefForTask } from "@/lib/taskView";
import { TASK_TYPE_HUE } from "@/lib/taskType";

// Suggested next action on a task (dev-feedback #21). Replaces the old fixed
// "task type says Pricing/Quote -> show Create quote" gate with a real
// judgment call about what Jordan needs to do next, grounded in the task's
// actual text plus anything already confirmed-linked to it (lib/ai.ts's
// suggestTaskAction, via /api/tasks/suggest-action). Shared by TaskDetail
// (TasksTable.tsx) and TaskCard (TasksGrouped.tsx) so the two views can never
// show a different suggestion for the same task.
//
// Jordan's own example: "Get quote approval from Mike to send sterile 6 cc
// Luer Lock syringe to Duran" used to suggest "Create quote" purely because
// the text contains the word "quote" (the old keyword classifier). The real
// next step is asking Mike, so this now offers "Draft email to Mike" instead,
// grounded in the task's own text (and any linked meeting/email) via
// /api/tasks/draft-action-email, landing at /compose for Jordan to review
// and edit before sending, never auto-sent.
export default function TaskSuggestedAction({ t }: { t: TaskView }) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tasks/suggest-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceFile: t.sourceFile,
        sourceLine: t.sourceLine,
        title: t.title,
        description: t.description ?? "",
        type: t.type,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok) setSuggestion(data as Suggestion);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-check only when the task identity or its own text changes, not on
    // every keystroke of an in-progress edit elsewhere on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.sourceFile, t.sourceLine, t.title, t.description, t.type]);

  async function draftEmail() {
    if (!suggestion || drafting) return;
    setDrafting(true);
    setDraftErr(null);
    try {
      const res = await fetch("/api/tasks/draft-action-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFile: t.sourceFile,
          sourceLine: t.sourceLine,
          title: t.title,
          description: t.description ?? "",
          recipientName: suggestion.recipientName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraftErr(data.error ?? "Could not draft the email.");
        return;
      }
      const params = new URLSearchParams();
      if (suggestion.recipientEmail) params.set("to", suggestion.recipientEmail);
      params.set("subject", data.subject ?? t.title);
      params.set("body", data.bodyHtml ?? "");
      router.push(`/compose?${params.toString()}`);
    } catch {
      setDraftErr("Network error.");
    } finally {
      setDrafting(false);
    }
  }

  if (!suggestion || suggestion.action === "none") return null;
  const hue = TASK_TYPE_HUE[t.type];

  return (
    <div className="mt-3.5">
      {suggestion.action === "create-quote" ? (
        <Link
          href={quoteHrefForTask(t)}
          className="btn-outline inline-flex items-center gap-1.5 text-xs"
          style={{ borderColor: hue, color: hue }}
        >
          Create quote →
        </Link>
      ) : (
        <button
          type="button"
          onClick={draftEmail}
          disabled={drafting}
          className="btn-outline inline-flex items-center gap-1.5 text-xs disabled:opacity-60"
          style={{ borderColor: hue, color: hue }}
        >
          {drafting
            ? "Drafting…"
            : `Draft email${suggestion.recipientName ? ` to ${suggestion.recipientName}` : ""} →`}
        </button>
      )}
      {suggestion.reason ? <p className="mt-1 text-2xs text-muted">{suggestion.reason}</p> : null}
      {suggestion.linkedMeetingNote ? (
        <p className="mt-0.5 text-2xs text-muted">
          Grounded in meeting note:{" "}
          <Link
            href={`/meetings?note=${encodeURIComponent(suggestion.linkedMeetingNote.sourcePath)}`}
            className="text-accent2 hover:underline"
          >
            {suggestion.linkedMeetingNote.title}
          </Link>
        </p>
      ) : null}
      {draftErr ? <p className="mt-1 text-2xs text-danger">{draftErr}</p> : null}
    </div>
  );
}

interface Suggestion {
  action: "draft-email" | "create-quote" | "none";
  recipientName: string | null;
  recipientEmail: string | null;
  reason: string;
  linkedMeetingNote: { title: string; sourcePath: string } | null;
}
