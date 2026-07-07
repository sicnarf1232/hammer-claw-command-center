"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PATHWAYS: { key: string; label: string }[] = [
  { key: "needs-reply", label: "Needs reply" },
  { key: "quote-request", label: "Quote" },
  { key: "quality-pcn", label: "Quality / PCN" },
  { key: "logistics", label: "Logistics" },
  { key: "fyi", label: "FYI" },
  { key: "noise", label: "Noise" },
];

// Manual triage controls: pick a pathway, or confirm the thread is reviewed
// (which clears it from Needs-attention). Latches so AI won't overwrite. While
// the row is still AI-authored, a provenance chip names the model; tapping any
// pathway is the one-tap correction (the AI's values are kept in ai_snapshot).
export default function TriageBar({
  threadKey,
  pathway,
  reviewed,
  aiGenerated = false,
  model = null,
}: {
  threadKey: string;
  pathway: string | null;
  reviewed: boolean;
  aiGenerated?: boolean;
  model?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [curPathway, setCurPathway] = useState(pathway);
  const [isReviewed, setReviewed] = useState(reviewed);

  async function send(payload: Record<string, unknown>, tag: string) {
    setBusy(tag);
    try {
      const res = await fetch("/api/inbox/triage-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: threadKey, ...payload }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card mb-4 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="eyebrow text-muted">Triage</span>
          {aiGenerated && !isReviewed ? (
            <span
              className="rounded-full border border-border bg-surface px-2 py-0.5 text-2xs text-muted"
              title="This triage was set by AI and not yet confirmed. Tap a pathway to correct it or Mark reviewed to confirm."
            >
              AI{model ? `: ${model}` : ""}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setReviewed(!isReviewed);
            send({ reviewed: !isReviewed }, "reviewed");
          }}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            isReviewed
              ? "bg-ok text-white"
              : "border border-border bg-surface text-fg/70 hover:text-fg"
          }`}
        >
          {isReviewed ? "✓ Reviewed" : "Mark reviewed"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PATHWAYS.map((p) => {
          const active = curPathway === p.key;
          return (
            <button
              key={p.key}
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setCurPathway(p.key);
                send({ pathway: p.key }, p.key);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-transparent bg-primary text-primary-fg"
                  : "border-border bg-surface text-fg/70 hover:text-fg"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
