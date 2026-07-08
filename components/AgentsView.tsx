"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AGENTS,
  LEVEL_LABEL,
  LEVEL_ORDER,
  type AgentKey,
  type AgentLevel,
} from "@/lib/agents/registry";
import type { AgentsData, AgentStats, ReviewItem, Verdict } from "@/lib/agents/metrics";

// The /agents oversight view (docs/AGENTIC-TRIAGE.md, Figma 2026-07-08):
// Roster (cards + switches + model choice), Review (grade agent work,
// keyboard-driven), Scorecard (trust ladder + gates + per-model A/B),
// Ledger (everything they did, with provenance).

const PATHWAYS: Array<{ key: string; label: string; color: string }> = [
  { key: "needs-reply", label: "Needs reply", color: "var(--due)" },
  { key: "quote-request", label: "Quote", color: "var(--accent)" },
  { key: "quality-pcn", label: "Quality / PCN", color: "var(--warm)" },
  { key: "logistics", label: "Logistics", color: "var(--info, #5145e6)" },
  { key: "fyi", label: "FYI", color: "var(--ink-3)" },
  { key: "noise", label: "Noise", color: "var(--ink-3)" },
];

const BLAST_LABEL: Record<string, string> = {
  reversible: "Reversible",
  "outward-facing": "Outward-facing",
  "read-only": "Read-only output",
};

function shortModel(id: string | null): string {
  if (!id) return "";
  if (id.startsWith("claude-opus")) return "Opus";
  if (id.startsWith("claude-sonnet")) return "Sonnet";
  if (id.startsWith("claude-haiku")) return "Haiku";
  return id;
}

function rel(isoDate: string | null): string {
  if (!isoDate) return "never";
  const mins = Math.round((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default function AgentsView({ data }: { data: AgentsData }) {
  const [tab, setTab] = useState<"roster" | "review" | "scorecard" | "ledger">("roster");
  const pendingCount = data.review.length;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display-title text-[26px] leading-tight text-fg">Agents</h1>
          <p className="mt-1 text-sm text-muted">
            Five workers, one trust ladder. Every verdict trains them while doing
            real work.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs text-muted">
          <span className="font-semibold text-fg">This week</span> · touched{" "}
          <span className="font-semibold text-fg">{data.week.items}</span> items · est.
          cost <span className="font-semibold text-fg">${data.week.estCost.toFixed(2)}</span>
        </div>
      </header>

      <nav className="mb-5 flex items-center gap-5 border-b border-border">
        {(
          [
            ["roster", "Roster"],
            ["review", "Review"],
            ["scorecard", "Scorecard"],
            ["ledger", "Ledger"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 border-b-2 pb-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-[var(--accent)] text-accent"
                : "border-transparent text-fg/60 hover:text-fg"
            }`}
          >
            {label}
            {key === "review" && pendingCount > 0 ? (
              <span className="rounded-full bg-accentSoft px-1.5 text-2xs font-bold tabular-nums text-accent">
                {pendingCount}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "roster" ? <Roster agents={data.agents} /> : null}
      {tab === "review" ? <Review items={data.review} /> : null}
      {tab === "scorecard" ? <Scorecard agents={data.agents} /> : null}
      {tab === "ledger" ? <Ledger rows={data.ledger} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Roster ----

function Roster({ agents }: { agents: AgentStats[] }) {
  return (
    <div className="space-y-3">
      {agents.map((a) => (
        <AgentCard key={a.key} a={a} />
      ))}
    </div>
  );
}

function AgentCard({ a }: { a: AgentStats }) {
  const def = AGENTS.find((d) => d.key === a.key)!;
  const [enabled, setEnabled] = useState(a.settings.enabled);
  const [model, setModel] = useState(a.settings.modelChoice);
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch("/api/agents/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: a.key, ...body }),
      });
    } finally {
      setSaving(false);
    }
  }

  const gatePct = def.gate.decisions
    ? Math.min((a.decisions / def.gate.decisions) * 100, 100)
    : 0;
  const gateMet =
    a.decisions >= def.gate.decisions &&
    (a.agreementPct ?? 0) >= def.gate.agreementPct;

  return (
    <section className={`card p-4 ${enabled ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accentSoft text-accent">
            <BotGlyph />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[15px] font-bold text-fg">{def.name}</span>
              <LevelChip level={a.level} />
              <BlastChip blast={def.blast} />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">{def.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={model}
            onChange={(e) => {
              const v = e.target.value as typeof model;
              setModel(v);
              patch({ modelChoice: v });
            }}
            disabled={saving}
            title="Which runtime model this agent uses"
            className="rounded-lg border border-border bg-surface px-1.5 py-1 text-2xs text-fg/75"
          >
            <option value="default">Model: default</option>
            <option value="smart">Opus (smart)</option>
            <option value="fast">Sonnet (fast)</option>
            <option value="ab">A/B test both</option>
          </select>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => {
              const next = !enabled;
              setEnabled(next);
              patch({ enabled: next });
            }}
            disabled={saving}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              enabled ? "bg-[var(--accent)]" : "bg-surface2"
            }`}
            title={enabled ? "On (click to pause)" : "Paused (click to enable)"}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
              style={{ left: enabled ? 18 : 2 }}
            />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-6">
          <Stat
            big={a.agreementPct != null ? `${a.agreementPct}%` : "—"}
            label="agreement"
            accent={a.agreementPct != null}
          />
          <Stat big={String(a.volume7d)} label="items/week" />
          <Stat big={`$${a.estCostWeek.toFixed(2)}`} label="est. cost/week" />
          <Stat
            big={a.errorRate != null ? `${a.errorRate}%` : "—"}
            label="error rate"
          />
        </div>
        <div className="text-right">
          <div className="text-2xs text-muted">Last active {rel(a.lastActiveISO)}</div>
          {a.streak ? (
            <div className="mt-0.5 text-2xs font-semibold text-warm">🔥 {a.streak}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-2xs">
          <span className="text-muted">
            Gate to <span className="font-semibold text-fg/80">{LEVEL_LABEL[def.gate.toLevel]}</span>
            {" · "}
            {def.gate.decisions} decisions at {def.gate.agreementPct}%+
          </span>
          <span className="tabular-nums text-muted">
            {Math.min(a.decisions, def.gate.decisions)}/{def.gate.decisions}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2">
          <div
            className="h-full rounded-full"
            style={{
              width: `${gatePct}%`,
              background: gateMet ? "var(--accent)" : "var(--warm)",
            }}
          />
        </div>
        {gateMet ? (
          <div className="mt-1 text-2xs font-semibold text-accent">
            Gate met. Promotion is yours to grant when the review flow ships.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ big, label, accent }: { big: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={`text-lg font-bold tabular-nums ${accent ? "text-accent" : "text-fg"}`}>
        {big}
      </div>
      <div className="text-2xs text-muted">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Review ----

function Review({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const remaining = items.slice(idx);
  const item = remaining[0] ?? null;

  async function verdictTriage(pathway: string) {
    if (!item || busy) return;
    setBusy(true);
    try {
      await fetch("/api/agents/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.threadKey, pathway }),
      });
    } finally {
      setBusy(false);
      setEditing(false);
      setDoneCount((c) => c + 1);
      setIdx((i) => i + 1);
    }
  }

  async function decideProposal(action: "approve" | "reject") {
    if (!item || busy) return;
    const id = Number(item.id.split(":")[1]);
    setBusy(true);
    try {
      await fetch("/api/proposals/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], action }),
      });
    } finally {
      setBusy(false);
      setDoneCount((c) => c + 1);
      setIdx((i) => i + 1);
    }
  }

  function approve() {
    if (!item) return;
    if (item.agent === "triage") verdictTriage(item.proposed);
    else decideProposal("approve");
  }
  function reject() {
    if (!item) return;
    if (item.agent === "triage") setEditing(true);
    else decideProposal("reject");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "a") approve();
      else if (k === "e" || k === "r") setEditing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, busy]);

  if (!item) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center">
        <div className="text-sm font-semibold text-fg">
          {doneCount > 0 ? `${doneCount} graded. Queue clear.` : "Nothing to review"}
        </div>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          New triage calls and proposals land here as agents work. Every grade
          moves them along the trust ladder.
        </p>
        {doneCount > 0 ? (
          <button
            type="button"
            onClick={() => router.refresh()}
            className="btn-outline mt-3 text-sm"
          >
            Check for more
          </button>
        ) : null}
      </div>
    );
  }

  const pathwayMeta = PATHWAYS.find((p) => p.key === item.proposed);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          {items.length} to review
          <span className="flex items-center gap-1">
            {items.map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: i < doneCount ? "var(--accent)" : "var(--surface-2)",
                }}
              />
            ))}
          </span>
          <span className="text-2xs font-normal tabular-nums text-muted">
            {doneCount}/{items.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-2xs text-muted">
          <Kbd>A</Kbd> Approve <Kbd>E</Kbd> Edit <Kbd>R</Kbd> Reject
        </div>
      </div>

      <section className="card max-w-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accentSoft px-2 py-0.5 text-2xs font-bold text-accent">
            {AGENTS.find((d) => d.key === item.agent)?.name ?? item.agent}
          </span>
          <span className="text-xs font-semibold text-fg">{item.kind}</span>
          <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs text-muted">
            {item.blast}
          </span>
          <span className="ml-auto text-2xs text-muted">{rel(item.atISO)}</span>
          {item.threadKey ? (
            <Link
              href={`/inbox?selected=${encodeURIComponent(item.threadKey)}`}
              className="rounded-lg border border-border px-2 py-0.5 text-2xs text-fg/70 hover:border-accent hover:text-accent"
            >
              ↗ Thread
            </Link>
          ) : null}
        </div>

        <div className="mt-3 rounded-xl bg-surface2 px-3 py-2">
          <div className="text-sm font-semibold text-fg">{item.title}</div>
          {item.detail ? <div className="mt-0.5 text-xs text-muted">{item.detail}</div> : null}
        </div>

        {item.agent === "triage" ? (
          <>
            <div className="mt-3 text-xs text-muted">Agent proposes this pathway:</div>
            <div className="mt-1.5">
              <span
                className="inline-flex items-center rounded-xl border px-3 py-1.5 text-sm font-semibold"
                style={{
                  color: pathwayMeta?.color ?? "var(--accent)",
                  borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
                  background: "var(--accent-soft, transparent)",
                }}
              >
                {pathwayMeta?.label ?? item.proposed}
              </span>
            </div>
            {editing ? (
              <div className="mt-3">
                <div className="mb-1.5 text-2xs text-muted">Correct to:</div>
                <div className="flex flex-wrap gap-1.5">
                  {PATHWAYS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      disabled={busy}
                      onClick={() => verdictTriage(p.key)}
                      className={`rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors ${
                        p.key === item.proposed
                          ? "border-accent text-accent"
                          : "border-border text-fg/70 hover:border-accent hover:text-accent"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-3 text-xs text-muted">
            Approving executes this proposal through the existing queue; rejecting
            discards it.
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={busy}
              className="btn-outline text-sm disabled:opacity-50"
            >
              {item.agent === "triage" ? "Edit" : "Reject"} <Kbd>{item.agent === "triage" ? "E" : "R"}</Kbd>
            </button>
          </div>
          <button
            type="button"
            onClick={approve}
            disabled={busy || editing}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : "Approve"} <Kbd dark>A</Kbd>
          </button>
        </div>
      </section>
    </div>
  );
}

function Kbd({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      className={`ml-1 inline-flex items-center rounded border px-1 font-mono text-[9px] ${
        dark ? "border-white/40 text-white/80" : "border-border text-muted"
      }`}
    >
      {children}
    </span>
  );
}

// -------------------------------------------------------------- Scorecard ----

function Scorecard({ agents }: { agents: AgentStats[] }) {
  const [selected, setSelected] = useState<AgentKey>("triage");
  const a = agents.find((x) => x.key === selected) ?? agents[0];
  const def = AGENTS.find((d) => d.key === a.key)!;
  const currentIdx = LEVEL_ORDER.indexOf(a.level);
  const remaining = Math.max(def.gate.decisions - a.decisions, 0);
  const verdictCounts = useMemo(() => {
    const c = { approved: 0, edited: 0, rejected: 0 };
    for (const v of a.last20) {
      if (v === "approved") c.approved++;
      else if (v === "edited") c.edited++;
      else if (v === "rejected") c.rejected++;
    }
    return c;
  }, [a.last20]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex shrink-0 gap-2 overflow-x-auto lg:w-48 lg:flex-col">
        {agents.map((x) => {
          const d = AGENTS.find((dd) => dd.key === x.key)!;
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => setSelected(x.key)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                x.key === a.key
                  ? "border-accent bg-accentSoft"
                  : "border-border bg-surface hover:border-line2"
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accentSoft text-accent">
                <BotGlyph small />
              </span>
              <span>
                <span className="block text-xs font-bold text-fg">{d.name}</span>
                <span className="block text-2xs text-muted">{LEVEL_LABEL[x.level]}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <section className="card p-4">
          <div className="eyebrow mb-3 text-muted">Trust ladder</div>
          <div className="flex items-center">
            {LEVEL_ORDER.map((lvl, i) => (
              <div key={lvl} className={`flex items-center ${i > 0 ? "flex-1" : ""}`}>
                {i > 0 ? (
                  <span
                    className="mx-1 h-px flex-1"
                    style={{
                      background: i <= currentIdx ? "var(--accent)" : "var(--line-2, var(--surface-2))",
                    }}
                  />
                ) : null}
                <span className="flex flex-col items-center gap-1">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-2xs font-bold"
                    style={{
                      background:
                        i < currentIdx
                          ? "var(--accent)"
                          : i === currentIdx
                            ? "var(--warm)"
                            : "var(--surface-2)",
                      color: i <= currentIdx ? "#fff" : "var(--ink-3)",
                      boxShadow: i === currentIdx ? "0 0 10px var(--warm)" : undefined,
                    }}
                  >
                    {i < currentIdx ? "✓" : "•"}
                  </span>
                  <span
                    className={`text-2xs ${i === currentIdx ? "font-bold text-fg" : "text-muted"}`}
                  >
                    {LEVEL_LABEL[lvl]}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-sm font-bold text-fg">
                Gate to {LEVEL_LABEL[def.gate.toLevel]}
              </div>
              <div className="text-2xs text-muted">
                {def.gate.decisions} decisions at {def.gate.agreementPct}%+ agreement
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums text-fg">
              {Math.min(a.decisions, def.gate.decisions)}
              <span className="text-sm text-muted">/{def.gate.decisions}</span>
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min((a.decisions / def.gate.decisions) * 100, 100)}%`,
                background: "var(--warm)",
              }}
            />
          </div>
          <div className="mt-1.5 text-2xs text-muted">
            {remaining > 0 ? `${remaining} more decisions` : "Decision count met"} · avg{" "}
            <span className="font-semibold text-fg/80">
              {a.agreementPct != null ? `${a.agreementPct}%` : "n/a"}
            </span>{" "}
            (gate: {def.gate.agreementPct}%)
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="card p-4">
            <div className="eyebrow mb-2 text-muted">Agreement</div>
            <div className="text-3xl font-bold text-accent">
              {a.agreementPct != null ? `${a.agreementPct}%` : "—"}
            </div>
            <div className="text-2xs text-muted">
              {a.decisions ? `over ${a.decisions} graded decisions` : "no graded decisions yet"}
            </div>
            {a.streak ? (
              <div className="mt-2 rounded-lg bg-accentSoft px-2 py-1 text-2xs font-semibold text-accent">
                🔥 {a.streak}
              </div>
            ) : null}
            {a.modelMix.length > 1 ? (
              <div className="mt-3 space-y-1 border-t border-border pt-2">
                <div className="text-2xs font-semibold text-muted">By model (A/B)</div>
                {a.modelMix.map((m) => (
                  <div key={m.model} className="flex items-center justify-between text-2xs">
                    <span className="text-fg/75">{shortModel(m.model)}</span>
                    <span className="tabular-nums text-muted">
                      {m.count} items ·{" "}
                      <span className="font-semibold text-fg/80">
                        {m.agreementPct != null ? `${m.agreementPct}%` : "n/a"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="card p-4">
            <div className="eyebrow mb-2 text-muted">Cost & health</div>
            <dl className="space-y-1.5 text-xs">
              <Row k="Est. this week" v={`$${a.estCostWeek.toFixed(2)}`} />
              <Row
                k="Est. per item"
                v={a.volume7d ? `¢${((a.estCostWeek / a.volume7d) * 100).toFixed(1)}` : "—"}
              />
              <Row k="Error rate" v={a.errorRate != null ? `${a.errorRate}%` : "not logged"} />
              <Row k="Volume/week" v={String(a.volume7d)} />
              <Row k="Last active" v={rel(a.lastActiveISO)} />
            </dl>
          </section>
        </div>

        {a.last20.length ? (
          <section className="card p-4">
            <div className="eyebrow mb-2 text-muted">Last {a.last20.length} verdicts</div>
            <div className="flex items-center gap-1">
              {a.last20.map((v, i) => (
                <span
                  key={i}
                  title={v}
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      v === "approved"
                        ? "var(--accent)"
                        : v === "edited"
                          ? "var(--warm)"
                          : "var(--due)",
                  }}
                />
              ))}
            </div>
            <div className="mt-2 text-2xs text-muted">
              <span className="font-semibold text-fg/80">{verdictCounts.approved}</span> approved ·{" "}
              <span className="font-semibold text-fg/80">{verdictCounts.edited}</span> edited ·{" "}
              <span className="font-semibold text-fg/80">{verdictCounts.rejected}</span> rejected
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{k}</dt>
      <dd className="font-semibold tabular-nums text-fg/85">{v}</dd>
    </div>
  );
}

// ----------------------------------------------------------------- Ledger ----

function Ledger({ rows }: { rows: AgentsData["ledger"] }) {
  const [agentFilter, setAgentFilter] = useState("");
  const [verdictFilter, setVerdictFilter] = useState("");
  const shown = rows.filter(
    (r) =>
      (!agentFilter || r.agent === agentFilter) &&
      (!verdictFilter || r.verdict === verdictFilter),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-fg/75"
        >
          <option value="">All agents</option>
          {AGENTS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-fg/75"
        >
          <option value="">All verdicts</option>
          {(["pending", "approved", "edited", "rejected", "auto"] as Verdict[]).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="text-muted">{shown.length} entries</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface2 text-left text-2xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Time</th>
              <th className="px-3 py-2 font-semibold">Agent</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Blast</th>
              <th className="px-3 py-2 font-semibold">Model</th>
              <th className="px-3 py-2 font-semibold">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-t border-border text-fg/80">
                <td className="whitespace-nowrap px-3 py-2 text-muted">{rel(r.atISO)}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-accentSoft px-2 py-0.5 text-2xs font-semibold text-accent">
                    {AGENTS.find((d) => d.key === r.agent)?.name ?? r.agent}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.action}
                  {r.threadKey ? (
                    <Link
                      href={`/inbox?selected=${encodeURIComponent(r.threadKey)}`}
                      className="ml-1.5 text-2xs text-accent hover:underline"
                    >
                      ↗ thread
                    </Link>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs text-muted">
                    {r.blast}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{shortModel(r.model)}</td>
                <td className="px-3 py-2">
                  <VerdictChip v={r.verdict} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VerdictChip({ v }: { v: Verdict }) {
  const map: Record<Verdict, { label: string; color: string }> = {
    approved: { label: "Approved", color: "var(--accent)" },
    edited: { label: "Edited", color: "var(--warm)" },
    rejected: { label: "Rejected", color: "var(--due)" },
    pending: { label: "Pending", color: "var(--ink-3)" },
    auto: { label: "Auto", color: "var(--info, #5145e6)" },
  };
  const m = map[v];
  return (
    <span className="text-2xs font-semibold" style={{ color: m.color }}>
      {m.label}
    </span>
  );
}

// ------------------------------------------------------------------ Chips ----

function LevelChip({ level }: { level: AgentLevel }) {
  const color =
    level === "delegate"
      ? "var(--warm)"
      : level === "proposer"
        ? "var(--accent)"
        : level === "observer"
          ? "var(--info, #5145e6)"
          : "var(--ink-3)";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]"
      style={{ color, background: "var(--surface-2)" }}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

function BlastChip({ blast }: { blast: string }) {
  return (
    <span className="rounded-full bg-surface2 px-2 py-0.5 text-[9px] font-medium text-muted">
      {BLAST_LABEL[blast] ?? blast}
    </span>
  );
}

function BotGlyph({ small }: { small?: boolean }) {
  return (
    <svg
      className={small ? "h-3.5 w-3.5" : "h-4.5 w-4.5"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={small ? undefined : { width: 18, height: 18 }}
    >
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V5M12 5a1.5 1.5 0 1 0-.01-3.01A1.5 1.5 0 0 0 12 5z" />
      <circle cx="9" cy="14" r="1" fill="currentColor" />
      <circle cx="15" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}
