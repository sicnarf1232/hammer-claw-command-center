"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateShort } from "@/lib/dates";

const CADENCES = ["Weekly", "Biweekly", "Monthly", "Ad hoc"];

// Lowercase cadence from /api/series/derive back to the select's label.
const CADENCE_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  "ad hoc": "Ad hoc",
};

const MIN_SEED = 2;
const MAX_SEED = 12;
const MAX_LISTED = 50;

export interface SeedMeeting {
  title: string;
  date: string; // YYYY-MM-DD
  path: string; // source_path, the stable meeting identity
}

// Set up a rolling series by hand, before any meetings exist. The keywords and
// attendees become the series' match rules, so future Granola pulls link
// matching meetings to it automatically. Optionally seed the fields from past
// meetings: pick 2 to 12, Opus derives name/account/cadence/attendees/keywords,
// Jordan reviews, and the selected meetings get linked to the new series.
export default function NewSeriesForm({
  accountNames = [],
  recentMeetings = [],
}: {
  accountNames?: string[];
  recentMeetings?: SeedMeeting[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState("Weekly");
  const [account, setAccount] = useState("");
  const [participants, setParticipants] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed-from-past-meetings section
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedQuery, setSeedQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedBy, setSuggestedBy] = useState<string | null>(null);

  const seedMatches = useMemo(() => {
    const q = seedQuery.trim().toLowerCase();
    const hits = q
      ? recentMeetings.filter(
          (m) => m.title.toLowerCase().includes(q) || m.date.includes(q),
        )
      : recentMeetings;
    return hits.slice(0, MAX_LISTED);
  }, [recentMeetings, seedQuery]);

  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const canCreate =
    !!name.trim() && (split(participants).length > 0 || split(keywords).length > 0);
  const canSuggest =
    selected.size >= MIN_SEED && selected.size <= MAX_SEED && !suggesting && !busy;

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/series/derive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: Array.from(selected) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        name?: string;
        accountName?: string | null;
        cadence?: string | null;
        participants?: string[];
        keywords?: string[];
        modelUsed?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `Suggest failed (${res.status}).`);
      setName(data.name ?? "");
      setAccount(data.accountName ?? "");
      if (data.cadence && CADENCE_LABEL[data.cadence]) {
        setCadence(CADENCE_LABEL[data.cadence]);
      }
      setParticipants((data.participants ?? []).join(", "));
      setKeywords((data.keywords ?? []).join(", "));
      setSuggestedBy(data.modelUsed ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggest failed.");
    } finally {
      setSuggesting(false);
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/series/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          accountName: account.trim() || undefined,
          cadence: cadence.toLowerCase(),
          participants: split(participants),
          keywords: split(keywords),
          meetingPaths: Array.from(selected),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !data.path) throw new Error(data.error || `Create failed (${res.status}).`);
      setOpen(false);
      setName("");
      setAccount("");
      setParticipants("");
      setKeywords("");
      setSeedOpen(false);
      setSeedQuery("");
      setSelected(new Set());
      setSuggestedBy(null);
      setBusy(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)} className="btn btn-ghost px-3 py-1.5 text-xs">
          + New series
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-4 p-4" style={{ borderLeft: "3px solid var(--accent)" }}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold text-fg">New series</h3>
        <span className="text-xs text-muted">future pulled meetings that match will link here</span>
      </div>

      {/* Seed from past meetings: pick a few, Opus proposes the fields below */}
      {recentMeetings.length > 0 && (
        <div className="mb-3 rounded-md border p-3" style={{ borderColor: "var(--line-2)" }}>
          <button
            onClick={() => setSeedOpen((v) => !v)}
            disabled={busy}
            className="flex w-full items-center justify-between text-left text-xs font-semibold text-fg"
          >
            <span>
              Seed from past meetings
              <span className="ml-2 font-normal text-muted">
                pick {MIN_SEED} to {MAX_SEED}, Opus drafts the fields
              </span>
            </span>
            <span className="text-muted">{seedOpen ? "−" : "+"}</span>
          </button>
          {seedOpen && (
            <div className="mt-3">
              <input
                value={seedQuery}
                onChange={(e) => setSeedQuery(e.target.value)}
                placeholder={`Search ${recentMeetings.length} meetings…`}
                className="input mb-2 w-full"
                disabled={busy || suggesting}
              />
              <div
                className="max-h-48 overflow-y-auto rounded-md border"
                style={{ borderColor: "var(--line-2)" }}
              >
                {seedMatches.length === 0 ? (
                  <p className="p-3 text-xs text-muted">No meetings match.</p>
                ) : (
                  seedMatches.map((m) => (
                    <label
                      key={m.path}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-fg hover:bg-black/5"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(m.path)}
                        onChange={() => toggle(m.path)}
                        disabled={busy || suggesting}
                      />
                      <span className="tabular-nums text-muted">{formatDateShort(m.date)}</span>
                      <span className="truncate">{m.title}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={suggest}
                  disabled={!canSuggest}
                  className="btn btn-ghost px-3 py-1.5 text-xs"
                >
                  {suggesting ? "Asking Opus…" : "Suggest with Opus"}
                </button>
                <span className="text-xs text-muted">
                  {selected.size} selected
                  {selected.size > 0 &&
                    (selected.size < MIN_SEED || selected.size > MAX_SEED) &&
                    ` (need ${MIN_SEED} to ${MAX_SEED})`}
                </span>
              </div>
              {suggestedBy && (
                <p className="mt-1 text-xs text-muted">
                  Fields suggested by {suggestedBy}. Review and edit before creating; the
                  selected meetings will link to the new series.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted">
          Series name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stryker Weekly Sync"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Cadence
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            className="input mt-1 w-full"
            disabled={busy}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted sm:col-span-2">
          Customer account (optional, drives folder placement)
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            list="new-series-accounts"
            placeholder="Leave blank for Internal"
            className="input mt-1 w-full"
            disabled={busy}
          />
          <datalist id="new-series-accounts">
            {accountNames.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className="text-xs font-semibold text-muted">
          Key attendees (comma separated)
          <input
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            placeholder="Alice Smith, Bob Jones"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Title keywords (comma separated)
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="stryker, weekly sync"
            className="input mt-1 w-full"
            disabled={busy}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={create} disabled={busy || !canCreate} className="btn btn-primary px-3 py-1.5 text-xs">
          {busy ? "Creating…" : "Create series"}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
          Cancel
        </button>
        {selected.size > 0 && (
          <span className="text-xs text-muted">
            {selected.size} past meeting{selected.size === 1 ? "" : "s"} will link to this series
          </span>
        )}
      </div>
    </div>
  );
}
