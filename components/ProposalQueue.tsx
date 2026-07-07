"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
export default function ProposalQueue({ proposals }: { proposals: QueueProposal[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!proposals.length) return null;

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
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
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
            <ProposalCard p={p} busy={busy} decide={decide} />
            {childrenOf(p.id).map((c) => (
              <div key={c.id} className="mt-2 border-t border-border pt-2 pl-3">
                <ProposalCard p={c} busy={busy} decide={decide} />
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
}: {
  p: QueueProposal;
  busy: boolean;
  decide: (ids: number[], action: "approve" | "reject") => void;
}) {
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
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide([p.id], "approve")}
            className="btn btn-primary text-xs disabled:opacity-60"
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
      {p.contactsToAdd && p.contactsToAdd.names.length > 0 && (
        <div className="mt-1.5 text-2xs text-muted">
          Also adds {p.contactsToAdd.names.join(", ")} to{" "}
          <span className="text-fg">{p.contactsToAdd.accountName}</span>
        </div>
      )}
      {p.content ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-2xs text-muted hover:text-fg">
            Preview note
          </summary>
          <pre className="mt-1.5 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-2.5 text-2xs leading-relaxed text-fg/90">
            {p.content}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
