"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MeetingActionReview, {
  type ReviewActionView,
  type ReviewPersonOption,
} from "./MeetingActionReview";
import { approvalGate, type ReviewPanelState } from "@/lib/reviewGate";

export interface QueueProposal {
  id: number;
  kind: "meeting-file" | "series-update";
  parentId: number | null;
  summary: string | null;
  model: string | null;
  createdAt: string;
  // Expanded preview fields (subset of the payload, server-provided).
  path: string | null;
  content: string | null;
  contactsToAdd: { accountName: string; names: string[] } | null;
  // Structured action links to review (Slice C); [] for legacy payloads.
  actions: ReviewActionView[];
  // Meeting primary account and the accounts the meeting is ABOUT, reviewed as
  // separate concepts (an internal meeting can concern a customer).
  account: string | null;
  relatedAccounts: string[];
}

interface Outcome {
  id: number;
  status: string;
  detail?: string;
}

// Review queue for AI proposals (Granola meeting filings + rolling-series
// updates). Nothing reaches the vault until approved here. Series updates are
// grouped under their meeting; rejecting a meeting also rejects its pending
// series update.
export default function ProposalQueue({
  proposals,
  people,
}: {
  proposals: QueueProposal[];
  people: ReviewPersonOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Unsaved/saving action-review state per proposal id: Approve (per card and
  // Approve all) is disabled while any review panel is dirty or mid-save, so
  // selections cannot be silently lost by approving first.
  const [panelStates, setPanelStates] = useState<Record<number, ReviewPanelState>>({});

  if (!proposals.length) return null;

  const setPanelState = (id: number, state: ReviewPanelState) =>
    setPanelStates((prev) => {
      const cur = prev[id];
      if (cur && cur.dirty === state.dirty && cur.saving === state.saving) return prev;
      return { ...prev, [id]: state };
    });
  const allGate = approvalGate(Object.values(panelStates));

  const parents = proposals.filter((p) => p.kind === "meeting-file");
  const orphanChildren = proposals.filter(
    (p) => p.kind !== "meeting-file" && !parents.some((m) => m.id === p.parentId),
  );
  const childrenOf = (id: number) =>
    proposals.filter((p) => p.parentId === id && p.kind !== "meeting-file");

  async function decide(ids: number[], action: "approve" | "reject") {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/proposals/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(data.error ?? "Decide failed.");
      } else {
        const outcomes: Outcome[] = data.outcomes ?? [];
        const errs = outcomes.filter((o) => o.status === "error");
        setNote(
          errs.length
            ? `${errs.length} failed: ${errs.map((e) => e.detail ?? e.id).join("; ")}`
            : null,
        );
        router.refresh();
      }
    } catch {
      setNote("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const allIds = proposals.map((p) => p.id);

  return (
    <div className="card mb-5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="eyebrow text-muted">Awaiting your review</span>
          <span className="rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-fg">
            {proposals.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!allGate.allowed ? (
            <span className="text-2xs text-due">{allGate.reason}</span>
          ) : null}
          <button
            type="button"
            disabled={busy || !allGate.allowed}
            onClick={() => decide(allIds, "approve")}
            className="btn btn-primary text-xs disabled:opacity-60"
          >
            Approve all
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted">
        AI-staged changes. Nothing is written to the vault until you approve it
        here. Rejecting a meeting also rejects its series update.
      </p>
      {note && <p className="mb-2 text-xs text-danger">{note}</p>}
      <ul className="space-y-3">
        {[...parents, ...orphanChildren].map((p) => (
          <li key={p.id} className="rounded-lg border border-border p-3">
            <ProposalCard
              p={p}
              busy={busy}
              decide={decide}
              people={people}
              onPanelState={(s) => setPanelState(p.id, s)}
            />
            {childrenOf(p.id).map((c) => (
              <div key={c.id} className="mt-2 border-t border-border pt-2 pl-3">
                <ProposalCard
                  p={c}
                  busy={busy}
                  decide={decide}
                  people={people}
                  onPanelState={(s) => setPanelState(c.id, s)}
                />
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProposalCard({
  p,
  busy,
  decide,
  people,
  onPanelState,
}: {
  p: QueueProposal;
  busy: boolean;
  decide: (ids: number[], action: "approve" | "reject") => void;
  people: ReviewPersonOption[];
  onPanelState: (state: ReviewPanelState) => void;
}) {
  const router = useRouter();
  const isMeeting = p.kind === "meeting-file";

  // Local, editable copies so Jordan can fix a typo or correct a contact
  // before approving instead of rejecting and re-pulling from Granola. Saved
  // back to the pending proposal's payload; nothing reaches the vault until
  // Approve. Only meeting files are editable.
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(p.content ?? "");
  const [names, setNames] = useState<string[]>(p.contactsToAdd?.names ?? []);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Structured review panel state for THIS card; gates the card's Approve.
  const [reviewPanel, setReviewPanel] = useState<ReviewPanelState>({
    dirty: false,
    saving: false,
  });
  const gate = approvalGate([reviewPanel]);

  const contentDirty = isMeeting && content !== (p.content ?? "");
  const namesDirty =
    isMeeting &&
    !!p.contactsToAdd &&
    JSON.stringify(names) !== JSON.stringify(p.contactsToAdd.names);
  const dirty = contentDirty || namesDirty;

  async function save() {
    setSaving(true);
    setErr(null);
    setSavedNote(null);
    try {
      const body: { id: number; content?: string; contactNames?: string[] } = { id: p.id };
      if (contentDirty) body.content = content;
      if (namesDirty) body.contactNames = names;
      const res = await fetch("/api/proposals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not save the edit.");
      } else {
        setSavedNote("Saved. This is what Approve will file.");
        router.refresh();
      }
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-fg">
            {p.summary ?? `${p.kind} #${p.id}`}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-2xs text-muted">
            {p.path ? <span className="truncate">{p.path}</span> : null}
            {p.model ? (
              <span className="rounded-full border border-border px-1.5 py-0.5">
                AI: {p.model}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!gate.allowed ? (
            <span className="text-2xs text-due">{gate.reason}</span>
          ) : null}
          <button
            type="button"
            disabled={busy || !gate.allowed}
            onClick={() => decide([p.id], "approve")}
            className="btn btn-primary text-xs disabled:opacity-60"
            title={gate.reason ?? undefined}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide([p.id], "reject")}
            className="btn text-xs disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      </div>

      {/* Primary vs related accounts, reviewed as separate concepts: an
          internal meeting can be ABOUT a customer without becoming a customer
          meeting. Display-only here; the note's 🔗/📎 lines stay editable. */}
      {isMeeting && (p.account || p.relatedAccounts.length > 0) ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-muted">
          <span>
            Account:{" "}
            <span className="font-medium text-fg/85">{p.account ?? "Internal"}</span>
          </span>
          {p.relatedAccounts.length ? (
            <span>
              About: <span className="text-fg/85">{p.relatedAccounts.join(", ")}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Structured action-owner review (Slice C). */}
      {isMeeting ? (
        <MeetingActionReview
          proposalId={p.id}
          actions={p.actions}
          people={people}
          onPanelState={(s) => {
            setReviewPanel(s);
            onPanelState(s);
          }}
        />
      ) : null}

      {/* Contact assignments Jordan can proof and correct (add a missing last
          name, drop someone who was actually internal) before approval,
          rather than rejecting the whole note and re-pulling from Granola. */}
      {isMeeting && p.contactsToAdd ? (
        <div className="mt-2 rounded-md border border-border bg-surface p-2.5">
          <div className="mb-1.5 text-2xs text-muted">
            Adds these contacts to{" "}
            <span className="font-medium text-fg">{p.contactsToAdd.accountName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {names.map((n, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface2 px-2 py-0.5 text-2xs text-fg/85"
              >
                <input
                  value={n}
                  onChange={(e) =>
                    setNames((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  className="w-auto min-w-[3rem] max-w-[12rem] bg-transparent text-2xs text-fg/85 outline-none"
                  aria-label={`Contact ${i + 1}`}
                  size={Math.max(n.length, 4)}
                />
                <button
                  type="button"
                  onClick={() => setNames((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted hover:text-danger"
                  title="Remove this contact"
                  aria-label={`Remove ${n}`}
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  e.preventDefault();
                  setNames((prev) => [...prev, newName.trim()]);
                  setNewName("");
                }
              }}
              placeholder="+ add name"
              className="w-24 rounded-full border border-dashed border-line2 bg-transparent px-2 py-0.5 text-2xs text-fg/85 outline-none placeholder:text-muted"
              aria-label="Add a contact"
            />
          </div>
        </div>
      ) : null}

      {p.content ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-2xs text-muted hover:text-fg"
          >
            {open ? "Hide note" : isMeeting ? "Review and edit note" : "Preview note"} {open ? "▾" : "▸"}
          </button>
          {open ? (
            isMeeting ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck
                className="mt-1.5 h-80 w-full resize-y rounded-md border border-border bg-surface p-3 text-xs leading-relaxed text-fg/90 outline-none focus:border-accent"
              />
            ) : (
              <div className="mt-1.5 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-xs leading-relaxed text-fg/90">
                {p.content}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {isMeeting && (dirty || savedNote || err) ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {dirty ? (
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="btn btn-primary text-2xs disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save edits"}
            </button>
          ) : null}
          {savedNote && !dirty ? <span className="text-2xs text-ok">{savedNote}</span> : null}
          {dirty ? (
            <span className="text-2xs text-muted">Save before you approve, or the edit is lost.</span>
          ) : null}
          {err ? <span className="text-2xs text-danger">{err}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
