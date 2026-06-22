"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/customerHues";

export interface HubCandidateMeeting {
  date: string;
  title: string;
  noteBasename: string;
  notePath: string | null;
}
export interface HubCandidate {
  key: string;
  suggestedName: string;
  isOneOnOne: boolean;
  count: number;
  firstDate: string;
  lastDate: string;
  buckets: string[];
  bucket: string; // dominant bucket (placement)
  folder: string; // target Rolling folder, for preview
  participants: string[];
  meetings: HubCandidateMeeting[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""} ${Number(d.slice(8, 10))}`;

export default function SuggestedSeries({
  candidates,
}: {
  candidates: HubCandidate[];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (!candidates.length) return null;

  return (
    <div className="mb-6">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-sm font-bold text-fg">Suggested series</h3>
        <span className="chip" style={{ borderColor: "var(--line-2)" }}>
          {candidates.length}
        </span>
        <span className="text-xs text-muted">
          recurring meetings not yet a rolling series
        </span>
      </div>
      <div className="grid gap-2">
        {candidates.map((c) =>
          openKey === c.key ? (
            <CreateForm key={c.key} c={c} onCancel={() => setOpenKey(null)} />
          ) : (
            <button
              key={c.key}
              onClick={() => setOpenKey(c.key)}
              className="card lift flex items-center gap-4 p-3.5 text-left"
              style={{ borderLeft: "3px dashed var(--accent)" }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-xs font-bold"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {initials(c.suggestedName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">
                  {c.suggestedName}
                  {c.isOneOnOne && (
                    <span className="ml-2 text-2xs font-medium text-muted">1:1</span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {c.count} meetings · {monthDay(c.firstDate)}–{monthDay(c.lastDate)}
                  {c.buckets.length ? ` · ${c.buckets.join(", ")}` : ""}
                </div>
              </div>
              <span
                className="shrink-0 text-[12.5px] font-semibold"
                style={{ color: "var(--accent)" }}
              >
                Create series →
              </span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function CreateForm({ c, onCancel }: { c: HubCandidate; onCancel: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(c.suggestedName);
  const [cadence, setCadence] = useState(c.isOneOnOne ? "Weekly" : "");
  const [participants, setParticipants] = useState(c.participants.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          bucket: c.bucket,
          isOneOnOne: c.isOneOnOne,
          cadence: cadence.trim() || undefined,
          participants: participants
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          meetings: c.meetings,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (!res.ok || !data.path) {
        throw new Error(data.error || `Create failed (${res.status}).`);
      }
      router.push(`/meetings?series=${encodeURIComponent(data.path)}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
      setBusy(false);
    }
  }

  return (
    <div className="card p-4" style={{ borderLeft: "3px solid var(--accent)" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted">
          Series name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Cadence
          <input
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            placeholder="Weekly, Biweekly, …"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted sm:col-span-2">
          Participants (comma separated)
          <input
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-muted">
        Will summarize <strong className="text-fg">{c.count}</strong> existing
        meetings and create the doc in{" "}
        <code className="font-mono text-[11px]">{c.folder}/</code>. Notes stay the
        source of truth; this writes one new rolling-series file.
      </p>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="btn btn-primary px-3 py-1.5 text-xs"
        >
          {busy ? "Creating… (summarizing meetings)" : "Create series"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="btn btn-ghost px-3 py-1.5 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
