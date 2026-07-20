"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/customerHues";
import { formatDateShort } from "@/lib/dates";

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

// Meeting/series occurrence date badges use the house short form (MMM DD).
const monthDay = (d: string) => formatDateShort(d);
const DENY_KEY = "deniedSeries";

export default function SuggestedSeries({
  candidates,
}: {
  candidates: HubCandidate[];
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [formKey, setFormKey] = useState<string | null>(null);
  const [denied, setDenied] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DENY_KEY);
      if (raw) setDenied(new Set(JSON.parse(raw)));
    } catch {
      // ignore
    }
  }, []);

  function deny(key: string) {
    setDenied((prev) => {
      const next = new Set(prev).add(key);
      try {
        localStorage.setItem(DENY_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
    setExpandedKey(null);
    setFormKey(null);
  }

  const visible = candidates.filter((c) => !denied.has(c.key));
  if (!visible.length) return null;

  return (
    <div className="mb-6">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-sm font-bold text-fg">Suggested series</h3>
        <span className="chip" style={{ borderColor: "var(--line-2)" }}>{visible.length}</span>
        <span className="text-xs text-muted">recurring meetings not yet a rolling series</span>
      </div>
      <div className="grid gap-2">
        {visible.map((c) =>
          formKey === c.key ? (
            <CreateForm key={c.key} c={c} onCancel={() => setFormKey(null)} />
          ) : (
            <div
              key={c.key}
              className="card"
              style={{ borderLeft: "3px dashed var(--accent)" }}
            >
              <button
                onClick={() => setExpandedKey(expandedKey === c.key ? null : c.key)}
                className="flex w-full items-center gap-4 p-3.5 text-left"
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
                    {c.isOneOnOne && <span className="ml-2 text-2xs font-medium text-muted">1:1</span>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {c.count} meetings · {monthDay(c.firstDate)}–{monthDay(c.lastDate)}
                    {c.buckets.length ? ` · ${c.buckets.join(", ")}` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: "var(--accent)" }}>
                  {expandedKey === c.key ? "Hide ▲" : "Review ▾"}
                </span>
              </button>

              {expandedKey === c.key && (
                <div className="border-t border-border px-3.5 pb-3.5 pt-3">
                  {c.buckets.filter((b) => !/^(internal|unfiled)$/i.test(b)).length > 1 && (
                    <p className="mb-2 text-2xs" style={{ color: "var(--warm)" }}>
                      ⚠ Spans{" "}
                      {c.buckets.filter((b) => !/^(internal|unfiled)$/i.test(b)).join(" + ")} — if
                      those are different customers, this is probably not one series.
                    </p>
                  )}
                  <div className="grid gap-1">
                    {c.meetings.map((m, i) => {
                      const row = (
                        <div className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-xs hover:bg-surface2">
                          <span className="w-12 shrink-0 tabular-nums text-muted">{monthDay(m.date)}</span>
                          <span className="truncate text-fg">{m.title}</span>
                        </div>
                      );
                      return m.notePath ? (
                        <Link key={i} href={`/meetings?note=${encodeURIComponent(m.notePath)}`}>{row}</Link>
                      ) : (
                        <div key={i}>{row}</div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={() => setFormKey(c.key)} className="btn btn-primary px-3 py-1.5 text-xs">
                      Create series
                    </button>
                    <button onClick={() => deny(c.key)} className="btn btn-ghost px-3 py-1.5 text-xs">
                      Not a series
                    </button>
                  </div>
                </div>
              )}
            </div>
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
          participants: participants.split(",").map((p) => p.trim()).filter(Boolean),
          meetings: c.meetings,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !data.path) throw new Error(data.error || `Create failed (${res.status}).`);
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
          <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1 w-full" disabled={busy} />
        </label>
        <label className="text-xs font-semibold text-muted">
          Cadence
          <input value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="Weekly, Biweekly, …" className="input mt-1 w-full" disabled={busy} />
        </label>
        <label className="text-xs font-semibold text-muted sm:col-span-2">
          Participants (comma separated)
          <input value={participants} onChange={(e) => setParticipants(e.target.value)} className="input mt-1 w-full" disabled={busy} />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">
        Will summarize <strong className="text-fg">{c.count}</strong> existing meetings and create the
        doc in <code className="font-mono text-[11px]">{c.folder}/</code>.
      </p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={create} disabled={busy || !name.trim()} className="btn btn-primary px-3 py-1.5 text-xs">
          {busy ? "Creating… (summarizing meetings)" : "Create series"}
        </button>
        <button onClick={onCancel} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
