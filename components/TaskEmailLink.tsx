"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Small, additive components for dev-feedback #11 (smart task<->email
// linkage). Kept in their own file so ThreadDetail.tsx and the tasks page
// each only need to render one new element, not absorb this feature's state.
// Nothing here writes anything on its own: every confirm click is Jordan
// acting, per CLAUDE.md's rule that AI output never becomes canonical fact
// without his say-so.

export interface LinkedTask {
  taskId: string; // TaskView id: sourceFile:sourceLine
  title: string;
  done: boolean;
}

export interface TaskEmailSuggestion {
  taskId: string;
  title: string;
  score: number;
  reasons: string[];
}

function parseTaskId(id: string): { sourceFile: string; sourceLine: number } | null {
  const idx = id.lastIndexOf(":");
  if (idx <= 0) return null;
  const sourceFile = id.slice(0, idx);
  const sourceLine = Number(id.slice(idx + 1));
  if (!Number.isInteger(sourceLine)) return null;
  return { sourceFile, sourceLine };
}

// Thread view: confirmed links, cleaned of the task's inline [field::value]
// markers so the chip reads like a normal title.
function cleanTitle(s: string): string {
  return s.replace(/\[[A-Za-z][\w-]*::[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

export function LinkedTaskChips({ tasks }: { tasks: LinkedTask[] }) {
  if (!tasks.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-wide text-muted">
        Linked to:
      </span>
      {tasks.map((t) => (
        <Link
          key={t.taskId}
          href="/tasks"
          className={`chip border-accent2 text-2xs ${t.done ? "opacity-60 line-through" : "text-accent2"}`}
          title="Open the tasks page"
        >
          {cleanTitle(t.title)}
        </Link>
      ))}
    </div>
  );
}

// Thread view: "this email may complete..." suggestions with a WHY and a
// one-click confirm. Confirming writes a real task_emails row (aiGenerated:
// true, confirmedBy: jordan); it never happens on its own.
export function TaskCompletionSuggestions({
  suggestions,
  emailId,
  onConfirmed,
}: {
  suggestions: TaskEmailSuggestion[];
  emailId: number | null;
  onConfirmed?: (taskId: string) => void;
}) {
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const visible = suggestions.filter((s) => !dismissed.has(s.taskId));
  if (!visible.length || emailId == null) return null;

  async function confirm(s: TaskEmailSuggestion) {
    const parsed = parseTaskId(s.taskId);
    if (!parsed || emailId == null) return;
    setBusy(s.taskId);
    setErr(null);
    try {
      const res = await fetch("/api/tasks/link-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFile: parsed.sourceFile,
          sourceLine: parsed.sourceLine,
          emailIds: [emailId],
          aiGenerated: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "Could not link the task.");
      } else {
        setConfirmed((prev) => new Set(prev).add(s.taskId));
        onConfirmed?.(s.taskId);
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-line2 p-2.5">
      <div className="text-2xs font-semibold uppercase tracking-wide text-muted">
        This email may complete an open task
      </div>
      <div className="mt-1.5 grid gap-1.5">
        {visible.map((s) => {
          const isConfirmed = confirmed.has(s.taskId);
          return (
            <div key={s.taskId} className="flex flex-wrap items-start justify-between gap-2 text-xs">
              <div className="min-w-0">
                <span className="font-medium text-fg">{cleanTitle(s.title)}</span>
                {s.reasons.length ? (
                  <p className="mt-0.5 text-2xs text-muted">{s.reasons.join(" ")}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {isConfirmed ? (
                  <span className="text-2xs font-semibold text-ok">Linked</span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => confirm(s)}
                      disabled={busy === s.taskId}
                      className="rounded-lg border border-accent px-2 py-0.5 text-2xs font-semibold text-accent hover:bg-accentSoft disabled:opacity-50"
                    >
                      {busy === s.taskId ? "Linking…" : "This completes it"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissed((prev) => new Set(prev).add(s.taskId))}
                      className="text-2xs text-muted hover:text-fg"
                    >
                      Not this
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {err ? <p className="mt-1.5 text-2xs text-danger">{err}</p> : null}
    </div>
  );
}

interface LinkedEmailRow {
  emailId: number;
  subject: string | null;
  fromName: string | null;
  threadKey: string;
  aiGenerated: boolean;
}

interface EmailSuggestionRow {
  emailKey: string;
  score: number;
  reasons: string[];
  subject: string | null;
  fromName: string | null;
  threadKey: string;
}

// Tasks page: "Linked emails (N)" on an expanded task row. Lazy-fetches only
// when opened, since the tasks page can list a lot of rows and most stay
// collapsed. Reverse of TaskCompletionSuggestions: here Jordan is looking at
// a task and asking "did an email already handle this."
export function TaskLinkedEmails({
  sourceFile,
  sourceLine,
  onLinked,
}: {
  sourceFile: string;
  sourceLine: number;
  // Called after a suggested email is confirmed, so a sibling update-log
  // view can refetch and pick up the automatic "Linked to email..." entry
  // (dev-feedback #16 Part A) without this component knowing that exists.
  onLinked?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linked, setLinked] = useState<LinkedEmailRow[]>([]);
  const [suggested, setSuggested] = useState<EmailSuggestionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    fetch(
      `/api/tasks/linked-emails?sourceFile=${encodeURIComponent(sourceFile)}&sourceLine=${sourceLine}`,
    )
      .then((r) => r.json())
      .then((data) => {
        setLinked(Array.isArray(data.linked) ? data.linked : []);
        setSuggested(Array.isArray(data.suggested) ? data.suggested : []);
        setLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, loaded, sourceFile, sourceLine]);

  async function confirmSuggestion(s: EmailSuggestionRow) {
    setBusyKey(s.emailKey);
    try {
      const res = await fetch("/api/tasks/link-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFile,
          sourceLine,
          emailIds: [Number(s.emailKey)],
          aiGenerated: true,
        }),
      });
      if (res.ok) {
        setConfirmedKeys((prev) => new Set(prev).add(s.emailKey));
        onLinked?.();
      }
    } finally {
      setBusyKey(null);
    }
  }

  const count = linked.length;

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-2xs font-semibold text-muted hover:text-fg"
      >
        📧 Linked emails{loaded ? ` (${count})` : ""} {open ? "▾" : "▸"}
      </button>
      {open ? (
        loading ? (
          <p className="mt-1 text-2xs text-muted">Loading…</p>
        ) : (
          <div className="mt-1.5 grid gap-1">
            {linked.map((e) => (
              <Link
                key={e.emailId}
                href={`/inbox?selected=${encodeURIComponent(e.threadKey)}`}
                className="text-2xs text-accent2 hover:underline"
              >
                {e.subject || "(no subject)"} {e.fromName ? `· ${e.fromName}` : ""}
              </Link>
            ))}
            {!linked.length ? <p className="text-2xs text-muted">No linked emails yet.</p> : null}
            {suggested.length ? (
              <div className="mt-1 border-t border-line2 pt-1">
                <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
                  Possible matches
                </p>
                {suggested.map((s) => {
                  const confirmedNow = confirmedKeys.has(s.emailKey);
                  return (
                    <div key={s.emailKey} className="mt-1 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/inbox?selected=${encodeURIComponent(s.threadKey)}`}
                          className="text-2xs text-fg/80 hover:underline"
                        >
                          {s.subject || "(no subject)"} {s.fromName ? `· ${s.fromName}` : ""}
                        </Link>
                        {s.reasons.length ? (
                          <p className="text-2xs text-muted">{s.reasons.join(" ")}</p>
                        ) : null}
                      </div>
                      {confirmedNow ? (
                        <span className="shrink-0 text-2xs font-semibold text-ok">Linked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => confirmSuggestion(s)}
                          disabled={busyKey === s.emailKey}
                          className="shrink-0 rounded-lg border border-accent px-1.5 py-0.5 text-2xs font-semibold text-accent hover:bg-accentSoft disabled:opacity-50"
                        >
                          {busyKey === s.emailKey ? "Linking…" : "Link"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}

// Task detail "Email" action (dev-feedback #18): "Reply to customer" reuses
// the same GET this file's TaskLinkedEmails already calls, so a task with
// one confirmed-linked email jumps straight to that thread's reply box via
// the same /inbox?selected=<threadKey> pattern used by TaskLinkedEmails
// above and lib/notifyLink.ts; more than one linked email opens a small
// picker instead of guessing which thread Jordan means. "Create new email"
// is always available and hands off to /compose, which does its own
// account-contact prefill server-side.
export function TaskEmailAction({
  sourceFile,
  sourceLine,
  accountSlug,
  subject,
}: {
  sourceFile: string;
  sourceLine: number;
  accountSlug?: string;
  subject: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [linked, setLinked] = useState<LinkedEmailRow[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    fetch(
      `/api/tasks/linked-emails?sourceFile=${encodeURIComponent(sourceFile)}&sourceLine=${sourceLine}`,
    )
      .then((r) => r.json())
      .then((data) => {
        setLinked(Array.isArray(data.linked) ? data.linked : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true))
      .finally(() => setLoading(false));
  }, [open, loaded, sourceFile, sourceLine]);

  const composeHref = `/compose?subject=${encodeURIComponent(subject)}${
    accountSlug ? `&account=${encodeURIComponent(accountSlug)}` : ""
  }`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-outline text-2xs"
      >
        ✉️ Email {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-border bg-surface p-2 text-xs shadow-elevated">
          {loading ? (
            <p className="px-1 py-1 text-2xs text-muted">Checking linked emails…</p>
          ) : linked.length === 0 ? (
            <p className="px-1 py-1 text-2xs text-muted">
              {loaded ? "No linked email to reply to yet." : ""}
            </p>
          ) : linked.length === 1 ? (
            <Link
              href={`/inbox?selected=${encodeURIComponent(linked[0].threadKey)}`}
              className="block rounded-lg px-1.5 py-1 font-medium text-accent2 hover:bg-surface2"
            >
              Reply to customer
            </Link>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setPicking((p) => !p)}
                className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left font-medium text-accent2 hover:bg-surface2"
              >
                Reply to customer ({linked.length}) <span>{picking ? "▾" : "▸"}</span>
              </button>
              {picking ? (
                <div className="mt-0.5 grid gap-0.5 border-t border-line2 pt-1">
                  {linked.map((e) => (
                    <Link
                      key={e.emailId}
                      href={`/inbox?selected=${encodeURIComponent(e.threadKey)}`}
                      className="truncate rounded-lg px-1.5 py-1 text-2xs text-fg/80 hover:bg-surface2"
                    >
                      {e.subject || "(no subject)"} {e.fromName ? `· ${e.fromName}` : ""}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          <Link
            href={composeHref}
            className="mt-1 block rounded-lg border-t border-line2 px-1.5 pt-1.5 font-medium text-fg/80 hover:bg-surface2"
          >
            Create new email
          </Link>
        </div>
      ) : null}
    </div>
  );
}

interface LinkedMeetingRow {
  meetingId: number;
  title: string | null;
  date: string | null;
  accountName: string | null;
  aiGenerated: boolean;
  sourcePath: string | null;
}

interface MeetingSuggestionRow {
  meetingId: number;
  score: number;
  reasons: string[];
  title: string | null;
  date: string | null;
  sourcePath: string | null;
}

// Tasks page: "Linked meetings (N)" on an expanded task row (dev-feedback
// #14 Part 3). Same lazy-fetch-on-open, possible-matches pattern as
// TaskLinkedEmails above, just pointed at /api/tasks/linked-meetings and
// /api/tasks/link-meeting. This is a DIFFERENT relationship than a task's
// single origin meeting (the one it was born from at pull time): this is
// "also relates to / informed by," additive, and only ever written when
// Jordan clicks Link.
export function TaskLinkedMeetings({
  sourceFile,
  sourceLine,
  onLinked,
}: {
  sourceFile: string;
  sourceLine: number;
  // See TaskLinkedEmails' onLinked above: same purpose, meeting side.
  onLinked?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linked, setLinked] = useState<LinkedMeetingRow[]>([]);
  const [suggested, setSuggested] = useState<MeetingSuggestionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    fetch(
      `/api/tasks/linked-meetings?sourceFile=${encodeURIComponent(sourceFile)}&sourceLine=${sourceLine}`,
    )
      .then((r) => r.json())
      .then((data) => {
        setLinked(Array.isArray(data.linked) ? data.linked : []);
        setSuggested(Array.isArray(data.suggested) ? data.suggested : []);
        setLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, loaded, sourceFile, sourceLine]);

  async function confirmSuggestion(s: MeetingSuggestionRow) {
    setBusyId(s.meetingId);
    try {
      const res = await fetch("/api/tasks/link-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFile,
          sourceLine,
          meetingIds: [s.meetingId],
          aiGenerated: true,
        }),
      });
      if (res.ok) {
        setConfirmedIds((prev) => new Set(prev).add(s.meetingId));
        onLinked?.();
      }
    } finally {
      setBusyId(null);
    }
  }

  const count = linked.length;

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-2xs font-semibold text-muted hover:text-fg"
      >
        🗒 Linked meetings{loaded ? ` (${count})` : ""} {open ? "▾" : "▸"}
      </button>
      {open ? (
        loading ? (
          <p className="mt-1 text-2xs text-muted">Loading…</p>
        ) : (
          <div className="mt-1.5 grid gap-1">
            {linked.map((m) =>
              m.sourcePath ? (
                <Link
                  key={m.meetingId}
                  href={`/meetings?note=${encodeURIComponent(m.sourcePath)}`}
                  className="text-2xs text-accent2 hover:underline"
                >
                  {m.title || "(untitled meeting)"} {m.date ? `· ${m.date}` : ""}
                </Link>
              ) : (
                <span key={m.meetingId} className="text-2xs text-fg/80">
                  {m.title || "(untitled meeting)"} {m.date ? `· ${m.date}` : ""}
                </span>
              ),
            )}
            {!linked.length ? <p className="text-2xs text-muted">No linked meetings yet.</p> : null}
            {suggested.length ? (
              <div className="mt-1 border-t border-line2 pt-1">
                <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
                  Possible matches
                </p>
                {suggested.map((s) => {
                  const confirmedNow = confirmedIds.has(s.meetingId);
                  return (
                    <div key={s.meetingId} className="mt-1 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {s.sourcePath ? (
                          <Link
                            href={`/meetings?note=${encodeURIComponent(s.sourcePath)}`}
                            className="text-2xs text-fg/80 hover:underline"
                          >
                            {s.title || "(untitled meeting)"} {s.date ? `· ${s.date}` : ""}
                          </Link>
                        ) : (
                          <span className="text-2xs text-fg/80">
                            {s.title || "(untitled meeting)"} {s.date ? `· ${s.date}` : ""}
                          </span>
                        )}
                        {s.reasons.length ? (
                          <p className="text-2xs text-muted">{s.reasons.join(" ")}</p>
                        ) : null}
                      </div>
                      {confirmedNow ? (
                        <span className="shrink-0 text-2xs font-semibold text-ok">Linked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => confirmSuggestion(s)}
                          disabled={busyId === s.meetingId}
                          className="shrink-0 rounded-lg border border-accent px-1.5 py-0.5 text-2xs font-semibold text-accent hover:bg-accentSoft disabled:opacity-50"
                        >
                          {busyId === s.meetingId ? "Linking…" : "Link"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
