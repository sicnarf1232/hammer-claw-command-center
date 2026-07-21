"use client";

import { useState } from "react";
import type { WorkflowRow } from "@/lib/workflows";
import {
  moveStep,
  WORKFLOW_CHANNELS,
  type WorkflowChannel,
  type WorkflowStep,
} from "@/lib/workflowLogic";
import DelegatePicker, { type DelegateCandidate } from "@/components/DelegatePicker";

// The Workflows section of /agents (Main St. AI, dev-feedback #20's remaining
// half): Jordan's recurring end-to-end processes as visible, fully editable
// objects. Discovery is Jordan-triggered (the button below, POST
// /api/workflows/discover); suggestions arrive with evidence and model
// provenance and wait for his judgment. v1 displays and edits only: nothing
// here executes, routes, or sends anything.

const CHANNEL_LABEL: Record<WorkflowChannel, string> = {
  email: "email",
  meeting: "meeting",
  internal: "internal",
  other: "other",
};

function shortModel(id: string | null): string {
  if (!id) return "AI";
  if (id.startsWith("claude-opus")) return "Opus";
  if (id.startsWith("claude-sonnet")) return "Sonnet";
  if (id.startsWith("claude-haiku")) return "Haiku";
  return id;
}

let stepSeq = 0;
function newStepId(): string {
  stepSeq += 1;
  return `s-${Date.now().toString(36)}-${stepSeq}`;
}

export default function WorkflowsPanel({ initial }: { initial: WorkflowRow[] }) {
  const [list, setList] = useState<WorkflowRow[]>(initial);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/workflows");
      const data = await res.json();
      if (Array.isArray(data.workflows)) setList(data.workflows);
    } catch {
      /* keep the current list */
    }
  }

  async function discover() {
    if (discovering) return;
    setDiscovering(true);
    setNotice(null);
    setErr(null);
    try {
      const res = await fetch("/api/workflows/discover", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Discovery failed. Nothing was changed.");
        return;
      }
      if (data.note) {
        setNotice(String(data.note));
      } else {
        const n = Number(data.suggested ?? 0);
        const skipped = Number(data.skipped ?? 0);
        setNotice(
          (n === 1 ? "1 new suggestion." : `${n} new suggestions.`) +
            (skipped > 0
              ? ` ${skipped} matched workflows you already have and were skipped.`
              : ""),
        );
      }
      await refresh();
    } catch {
      setErr("Network error. Nothing was changed.");
    } finally {
      setDiscovering(false);
    }
  }

  async function act(id: number, action: "confirm" | "archive" | "delete") {
    setErr(null);
    try {
      const res = await fetch("/api/workflows/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "That change failed. Nothing was saved.");
        return;
      }
      if (editingId === id) setEditingId(null);
      await refresh();
    } catch {
      setErr("Network error. Nothing was saved.");
    }
  }

  const suggested = list.filter((w) => w.status === "suggested");
  const confirmed = list.filter((w) => w.status === "confirmed");
  const empty = suggested.length === 0 && confirmed.length === 0;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-fg">Workflows</h2>
          <p className="mt-0.5 text-sm text-muted">
            Main St. AI maps the processes you actually run, so you can see and
            shape them before anything acts on your behalf.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditingId("new")}
            disabled={editingId === "new"}
            className="btn-outline text-sm disabled:opacity-50"
          >
            New workflow
          </button>
          <button
            type="button"
            onClick={discover}
            disabled={discovering}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {discovering ? "Mapping your workflows…" : "Discover workflows"}
          </button>
        </div>
      </div>

      {notice ? (
        <p className="mb-3 rounded-xl bg-accentSoft/40 px-3 py-2 text-xs font-semibold text-accent">
          {notice}
        </p>
      ) : null}
      {err ? <p className="mb-3 text-xs text-danger">{err}</p> : null}

      {editingId === "new" ? (
        <div className="mb-4">
          <WorkflowEditor
            workflow={null}
            onCancel={() => setEditingId(null)}
            onSaved={async () => {
              setEditingId(null);
              await refresh();
            }}
          />
        </div>
      ) : null}

      {empty && editingId !== "new" ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center">
          <div className="text-sm font-semibold text-fg">No workflows yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Discover workflows has Main St. AI read your recent activity, email
            threads, delegated tasks, and completed task histories, then suggest
            the recurring processes it sees, with the evidence for each. You
            confirm, edit, or dismiss every suggestion. Nothing runs on its own.
          </p>
          <button
            type="button"
            onClick={discover}
            disabled={discovering}
            className="btn-primary mt-4 text-sm disabled:opacity-60"
          >
            {discovering ? "Mapping your workflows…" : "Discover workflows"}
          </button>
        </div>
      ) : null}

      {suggested.length ? (
        <section className="mb-5">
          <div className="eyebrow mb-2 text-muted">
            Suggested · awaiting your judgment
          </div>
          <div className="space-y-3">
            {suggested.map((w) =>
              editingId === w.id ? (
                <WorkflowEditor
                  key={w.id}
                  workflow={w}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await refresh();
                  }}
                />
              ) : (
                <WorkflowCard
                  key={w.id}
                  w={w}
                  onConfirm={() => act(w.id, "confirm")}
                  onEdit={() => setEditingId(w.id)}
                  onDismiss={() => act(w.id, "archive")}
                />
              ),
            )}
          </div>
        </section>
      ) : null}

      {confirmed.length ? (
        <section>
          <div className="eyebrow mb-2 text-muted">Confirmed</div>
          <div className="space-y-3">
            {confirmed.map((w) =>
              editingId === w.id ? (
                <WorkflowEditor
                  key={w.id}
                  workflow={w}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await refresh();
                  }}
                />
              ) : (
                <WorkflowCard
                  key={w.id}
                  w={w}
                  onEdit={() => setEditingId(w.id)}
                  onArchive={() => act(w.id, "archive")}
                />
              ),
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------- Card ----

function WorkflowCard({
  w,
  onConfirm,
  onEdit,
  onDismiss,
  onArchive,
}: {
  w: WorkflowRow;
  onConfirm?: () => void;
  onEdit: () => void;
  onDismiss?: () => void;
  onArchive?: () => void;
}) {
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-[15px] font-bold text-fg">{w.name}</span>
        {w.aiGenerated && w.model ? (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-2xs text-muted">
            AI: {shortModel(w.model)}
          </span>
        ) : null}
        {!w.aiGenerated ? (
          <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-2xs text-muted">
            Manual
          </span>
        ) : null}
        {w.status === "suggested" ? (
          <span className="rounded-full bg-accentSoft px-2 py-0.5 text-2xs font-bold text-accent">
            Suggested
          </span>
        ) : null}
      </div>

      {w.triggerSummary ? (
        <p className="mt-1.5 text-xs text-muted">
          <span className="font-semibold text-fg/70">When:</span> {w.triggerSummary}
        </p>
      ) : null}

      {w.steps.length ? (
        <ol className="mt-3 space-y-1.5">
          {w.steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-2 text-sm text-fg/85">
              <span
                className="mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-surface2 text-2xs font-bold tabular-nums text-muted"
                style={{ width: 18, height: 18 }}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                {s.description}
                {s.personName ? (
                  <span className="ml-1.5 rounded-full bg-accentSoft px-1.5 py-0.5 text-2xs font-semibold text-accent">
                    {s.personName}
                  </span>
                ) : null}
                {s.channel ? (
                  <span className="ml-1.5 text-2xs text-muted">
                    via {CHANNEL_LABEL[s.channel]}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-muted">No steps yet. Edit to add them.</p>
      )}

      {w.evidence.length ? (
        <div className="mt-3 rounded-xl bg-surface2/60 px-3 py-2">
          <div className="text-2xs font-semibold uppercase tracking-wide text-muted">
            Seen in
          </div>
          <ul className="mt-1 space-y-0.5">
            {w.evidence.map((e, i) => (
              <li key={i} className="truncate text-xs text-fg/70" title={e}>
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="btn-outline text-xs">
            Dismiss
          </button>
        ) : null}
        {onArchive ? (
          <button type="button" onClick={onArchive} className="btn-outline text-xs">
            Archive
          </button>
        ) : null}
        <button type="button" onClick={onEdit} className="btn-outline text-xs">
          Edit
        </button>
        {onConfirm ? (
          <button type="button" onClick={onConfirm} className="btn-primary text-xs">
            Confirm
          </button>
        ) : null}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- Editor ----

function WorkflowEditor({
  workflow,
  onCancel,
  onSaved,
}: {
  workflow: WorkflowRow | null; // null = create new (manual)
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState(workflow?.name ?? "");
  const [trigger, setTrigger] = useState(workflow?.triggerSummary ?? "");
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow?.steps ?? []);
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function patchStep(id: string, patch: Partial<WorkflowStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      { id: newStepId(), description: "", personName: null, personId: null, channel: null },
    ]);
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    if (pickingFor === id) setPickingFor(null);
  }

  function setPerson(id: string, person: DelegateCandidate | null) {
    if (person) {
      patchStep(id, { personName: person.name, personId: person.id });
      setPickingFor(null);
    }
    // Typing in the picker clears the pending selection; keep the picker open
    // until a real pick or an explicit close.
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Give the workflow a name first.");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload = {
      name: trimmed,
      triggerSummary: trigger.trim() || null,
      steps: steps.filter((s) => s.description.trim()),
    };
    try {
      const res = workflow
        ? await fetch("/api/workflows/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: workflow.id, action: "update", ...payload }),
          })
        : await fetch("/api/workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "Saving failed. Nothing was stored.");
        return;
      }
      await onSaved();
    } catch {
      setErr("Network error. Nothing was stored.");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!workflow) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/workflows/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: workflow.id, action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "Delete failed.");
        return;
      }
      await onSaved();
    } catch {
      setErr("Network error. Nothing was deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card border-accent/40 p-4">
      <div className="text-2xs font-semibold uppercase tracking-wide text-muted">
        {workflow ? "Edit workflow" : "New workflow"}
      </div>

      <label className="mt-2 block">
        <span className="text-2xs text-muted">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Drawing request"
          className="input mt-0.5 w-full px-2.5 py-1.5 text-sm"
          maxLength={120}
        />
      </label>

      <label className="mt-2.5 block">
        <span className="text-2xs text-muted">Trigger (when this happens)</span>
        <textarea
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          rows={2}
          placeholder="e.g. A customer requests a part drawing"
          className="input mt-0.5 w-full resize-none px-2.5 py-1.5 text-sm"
          maxLength={500}
        />
      </label>

      <div className="mt-3">
        <div className="mb-1 text-2xs text-muted">Steps, in order</div>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-border bg-surface2/40 p-2">
              <div className="flex items-start gap-2">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => moveStep(prev, i, "up"))}
                    disabled={i === 0}
                    aria-label="Move step up"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-fg disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => moveStep(prev, i, "down"))}
                    disabled={i === steps.length - 1}
                    aria-label="Move step down"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-fg disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    value={s.description}
                    onChange={(e) => patchStep(s.id, { description: e.target.value })}
                    placeholder={`Step ${i + 1}`}
                    className="input w-full px-2.5 py-1.5 text-sm"
                    maxLength={300}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {s.personName ? (
                      <span className="flex items-center gap-1 rounded-full bg-accentSoft px-2 py-0.5 text-2xs font-semibold text-accent">
                        {s.personName}
                        <button
                          type="button"
                          onClick={() =>
                            patchStep(s.id, { personName: null, personId: null })
                          }
                          aria-label={`Clear person for step ${i + 1}`}
                          className="text-accent/70 hover:text-accent"
                        >
                          ×
                        </button>
                      </span>
                    ) : pickingFor === s.id ? (
                      <span className="w-44">
                        <DelegatePicker value={null} onChange={(p) => setPerson(s.id, p)} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPickingFor(s.id)}
                        className="rounded-full border border-dashed border-border px-2 py-0.5 text-2xs text-muted hover:border-accent hover:text-accent"
                      >
                        + person
                      </button>
                    )}
                    <select
                      value={s.channel ?? ""}
                      onChange={(e) =>
                        patchStep(s.id, {
                          channel: (e.target.value || null) as WorkflowChannel | null,
                        })
                      }
                      aria-label={`Channel for step ${i + 1}`}
                      className="rounded-lg border border-border bg-surface px-1.5 py-0.5 text-2xs text-fg/75"
                    >
                      <option value="">channel…</option>
                      {WORKFLOW_CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {CHANNEL_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(s.id)}
                  aria-label={`Remove step ${i + 1}`}
                  className="shrink-0 rounded p-1 text-muted hover:text-danger"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-2 rounded-lg border border-dashed border-border px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent"
        >
          + Add step
        </button>
      </div>

      {workflow?.status === "suggested" ? (
        <p className="mt-3 text-2xs text-muted">
          Saving your edits also confirms this workflow. Its AI origin stays on
          the record.
        </p>
      ) : null}

      {err ? <p className="mt-2 text-xs text-danger">{err}</p> : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div>
          {workflow ? (
            <button
              type="button"
              onClick={del}
              disabled={busy}
              className="text-xs text-muted hover:text-danger disabled:opacity-50"
            >
              Delete
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-outline text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </section>
  );
}
