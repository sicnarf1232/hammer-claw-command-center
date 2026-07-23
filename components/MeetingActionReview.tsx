"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Structured review of a pending meeting proposal's action links (Slice C).
// Shows, per action: the extracted text, the owner as written, the resolver's
// suggestion with its "why", and explicit controls to accept, change, unassign,
// mark as team-owned, or reject. Decisions post to /api/proposals/update as
// actionReviews patches; nothing executes until the proposal is approved.

export interface ReviewActionView {
  actionId: string;
  text: string;
  ownerText: string | null;
  ownerReviewState: string;
  candidatePersonIds: number[];
  reasons: string[];
  confidence: string;
  isJordans: boolean;
  confirmedPersonId: number | null;
}

export interface ReviewPersonOption {
  id: number;
  name: string;
}

type PendingChoice =
  | { kind: "assign"; personId: number }
  | { kind: "unassigned" }
  | { kind: "group" }
  | { kind: "rejected" }
  | { kind: "suggested" };

const STATE_LABEL: Record<string, string> = {
  assigned: "Linked",
  suggested: "Suggested",
  ambiguous: "Needs your pick",
  unassigned: "No owner match",
  group: "Team-owned",
  rejected: "Not an action",
};

const STATE_CLASS: Record<string, string> = {
  assigned: "border-ok/40 text-ok",
  suggested: "border-accent/40 text-accent",
  ambiguous: "border-due/40 text-due",
  unassigned: "border-border text-muted",
  group: "border-border text-fg/70",
  rejected: "border-danger/40 text-danger",
};

export default function MeetingActionReview({
  proposalId,
  actions,
  people,
}: {
  proposalId: number;
  actions: ReviewActionView[];
  people: ReviewPersonOption[];
}) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<string, PendingChoice>>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.name]));
    return (id: number) => m.get(id) ?? `Person #${id}`;
  }, [people]);

  if (!actions.length) return null;

  const dirty = Object.keys(choices).length > 0;

  function effectiveState(a: ReviewActionView): { state: string; personId: number | null } {
    const c = choices[a.actionId];
    if (!c) {
      return { state: a.ownerReviewState, personId: a.confirmedPersonId };
    }
    if (c.kind === "assign") return { state: "assigned", personId: c.personId };
    if (c.kind === "suggested") return { state: "suggested", personId: null };
    return { state: c.kind, personId: null };
  }

  function choose(a: ReviewActionView, value: string) {
    setNote(null);
    setChoices((prev) => {
      const next = { ...prev };
      if (value === "__keep") {
        delete next[a.actionId];
      } else if (value === "__unassigned") {
        next[a.actionId] = { kind: "unassigned" };
      } else if (value === "__group") {
        next[a.actionId] = { kind: "group" };
      } else if (value === "__rejected") {
        next[a.actionId] = { kind: "rejected" };
      } else if (value === "__suggested") {
        next[a.actionId] = { kind: "suggested" };
      } else {
        next[a.actionId] = { kind: "assign", personId: Number(value) };
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      const actionReviews = Object.entries(choices).map(([actionId, c]) => ({
        actionId,
        state: c.kind === "assign" ? "assigned" : c.kind,
        ...(c.kind === "assign" ? { personId: c.personId } : {}),
      }));
      const res = await fetch("/api/proposals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proposalId, actionReviews }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(data.error ?? "Could not save the review.");
      } else {
        setChoices({});
        setNote("Saved. Approve will use these links.");
        router.refresh();
      }
    } catch {
      setNote("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-md border border-border bg-surface p-2.5">
      <div className="mb-1.5 text-2xs text-muted">
        Action owners. Accept or correct each link; nothing is written until you approve.
      </div>
      <ul className="space-y-2">
        {actions.map((a) => {
          const eff = effectiveState(a);
          const suggestion = a.candidatePersonIds[0];
          return (
            <li key={a.actionId} className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <span
                className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-2xs ${
                  STATE_CLASS[eff.state] ?? "border-border text-muted"
                }`}
              >
                {STATE_LABEL[eff.state] ?? eff.state}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-xs text-fg/90 ${eff.state === "rejected" ? "line-through opacity-60" : ""}`}
                >
                  {a.text}
                </div>
                <div className="mt-0.5 text-2xs text-muted">
                  {a.ownerText ? <>Owner as written: {a.ownerText}. </> : <>No owner stated. </>}
                  {eff.state === "assigned" && eff.personId != null ? (
                    <>Linked to {nameOf(eff.personId)}.</>
                  ) : a.candidatePersonIds.length ? (
                    <>
                      {a.ownerReviewState === "ambiguous" ? "Candidates: " : "Suggested: "}
                      {a.candidatePersonIds.map((id) => nameOf(id)).join(", ")}.
                    </>
                  ) : null}
                  {a.reasons.length ? (
                    <span className="opacity-80"> Why: {a.reasons.join(" ")}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {a.ownerReviewState !== "assigned" &&
                suggestion != null &&
                a.ownerReviewState === "suggested" &&
                !(a.actionId in choices) ? (
                  <button
                    type="button"
                    onClick={() => choose(a, String(suggestion))}
                    className="btn text-2xs"
                    title={`Confirm ${nameOf(suggestion)} as the owner`}
                  >
                    Accept
                  </button>
                ) : null}
                <select
                  value={
                    choices[a.actionId]
                      ? choices[a.actionId].kind === "assign"
                        ? String((choices[a.actionId] as { personId: number }).personId)
                        : `__${choices[a.actionId].kind}`
                      : "__keep"
                  }
                  onChange={(e) => choose(a, e.target.value)}
                  className="input max-w-[10rem] px-1.5 py-0.5 text-2xs"
                  aria-label={`Owner for: ${a.text}`}
                >
                  <option value="__keep">Keep as is</option>
                  {a.candidatePersonIds.length ? (
                    <optgroup label="Candidates">
                      {a.candidatePersonIds.map((id) => (
                        <option key={id} value={String(id)}>
                          {nameOf(id)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <optgroup label="States">
                    <option value="__unassigned">No owner</option>
                    <option value="__group">Team-owned</option>
                    <option value="__rejected">Not an action</option>
                    {a.candidatePersonIds.length ? (
                      <option value="__suggested">Back to suggestion</option>
                    ) : null}
                  </optgroup>
                  <optgroup label="Everyone">
                    {people.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </li>
          );
        })}
      </ul>
      {(dirty || note) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {dirty ? (
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="btn btn-primary text-2xs disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save action reviews"}
            </button>
          ) : null}
          {note ? (
            <span className={`text-2xs ${note.startsWith("Saved") ? "text-ok" : "text-danger"}`}>
              {note}
            </span>
          ) : null}
          {dirty ? (
            <span className="text-2xs text-muted">Save before you approve, or the review is lost.</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
