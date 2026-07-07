"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Price-agreement bulk importer (Phase 3): upload -> AI-proposed (or saved
// ruleset) column mapping -> Jordan reviews/fixes -> confirm. Nothing is
// written until Commit; the confirmed mapping is saved as a named ruleset
// keyed by the file's header signature, so the next upload from the same
// source auto-applies it.

const FIELDS = [
  { key: "part_number", label: "Part number", required: true },
  { key: "unit_price", label: "Unit price", required: true },
  { key: "account", label: "Account (column)", required: false },
  { key: "min_qty", label: "Qty tier (min qty)", required: false },
  { key: "effective_date", label: "Effective date", required: false },
  { key: "expires", label: "Expires", required: false },
] as const;

const ORIGINS = ["legacy", "contract", "negotiated", "catalog-override"] as const;

interface Analysis {
  documentId: number;
  fileName: string;
  headers: string[];
  rowCount: number;
  preview: string[][];
  signature: string;
  ruleset: { id: number; name: string; mapping: { columns: Record<string, string | null>; defaults: { origin: string; currency: string } } } | null;
  proposal: { columns: Record<string, string | null>; confidence: Record<string, number>; originGuess: string; modelUsed: string } | null;
}

export default function PriceImport({
  accounts,
}: {
  accounts: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "analyze" | "commit">("");
  const [err, setErr] = useState<string | null>(null);
  const [a, setA] = useState<Analysis | null>(null);
  const [columns, setColumns] = useState<Record<string, string | null>>({});
  const [origin, setOrigin] = useState<string>("legacy");
  const [accountId, setAccountId] = useState<string>("");
  const [rulesetName, setRulesetName] = useState("");
  const [result, setResult] = useState<{ inserted: number; superseded: number; skipped: Array<{ rowIndex: number; issue: string }> } | null>(null);

  async function analyze(file: File) {
    setBusy("analyze");
    setErr(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/analyze", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Analyze failed.");
        return;
      }
      const an = data as Analysis;
      setA(an);
      const m = an.ruleset?.mapping ?? (an.proposal ? { columns: an.proposal.columns, defaults: { origin: an.proposal.originGuess, currency: "USD" } } : null);
      setColumns(m?.columns ?? {});
      setOrigin(m?.defaults?.origin ?? "legacy");
      setRulesetName(an.ruleset?.name ?? "");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy("");
    }
  }

  async function commit() {
    if (!a) return;
    setBusy("commit");
    setErr(null);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: a.documentId,
          accountId: accountId ? Number(accountId) : undefined,
          mapping: { columns, defaults: { origin, currency: "USD" } },
          saveRulesetName: rulesetName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setErr(data.error ?? "Commit failed.");
      else {
        setResult(data);
        setA(null);
        router.refresh();
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy("");
    }
  }

  const conf = (f: string) => a?.proposal?.confidence?.[f];

  return (
    <div className="card mb-6 p-4">
      <div className="eyebrow text-muted">Bulk import</div>
      <p className="mt-1 text-sm text-muted">
        Upload a CSV or XLSX price list. The mapping is proposed (or recalled
        from a saved ruleset), you confirm it, and only then is anything
        written. Grandfathered pricing: leave expires unmapped and origin
        legacy.
      </p>

      {!a ? (
        <div className="mt-3">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={busy === "analyze"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) analyze(f);
              e.target.value = "";
            }}
            className="text-sm text-fg/80"
          />
          {busy === "analyze" ? <p className="mt-2 text-xs text-muted">Reading + proposing a mapping…</p> : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-fg">{a.fileName}</span>
            <span className="text-muted">{a.rowCount} rows</span>
            {a.ruleset ? (
              <span className="rounded-full bg-accentSoft px-2 py-0.5 text-2xs font-semibold text-accent">
                Ruleset applied: {a.ruleset.name}
              </span>
            ) : a.proposal ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-2xs text-muted">
                AI proposed ({a.proposal.modelUsed})
              </span>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-fg/75">
                  {f.label}
                  {f.required ? <span className="text-due"> *</span> : null}
                  {conf(f.key) != null ? (
                    <span className={`ml-1 text-2xs ${conf(f.key)! < 0.7 ? "text-warm" : "text-muted"}`}>
                      {Math.round(conf(f.key)! * 100)}%
                    </span>
                  ) : null}
                </span>
                <select
                  value={columns[f.key] ?? ""}
                  onChange={(e) =>
                    setColumns((c) => ({ ...c, [f.key]: e.target.value || null }))
                  }
                  className="input max-w-[55%] px-2 py-1 text-xs"
                >
                  <option value="">(not in file)</option>
                  {a.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-fg/75">Origin</span>
              <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="input px-2 py-1 text-xs">
                {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-fg/75">Account</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input px-2 py-1 text-xs">
                <option value="">From file column</option>
                {accounts.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
              </select>
            </label>
            <label className="flex flex-1 items-center gap-1.5">
              <span className="shrink-0 text-fg/75">Save ruleset as</span>
              <input
                value={rulesetName}
                onChange={(e) => setRulesetName(e.target.value)}
                placeholder="e.g. Stryker contract export"
                className="input min-w-[140px] flex-1 px-2 py-1 text-xs"
              />
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-2xs">
              <thead>
                <tr className="bg-surface2 text-left text-muted">
                  {a.headers.map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {a.preview.map((r, i) => (
                  <tr key={i} className="border-t border-border text-fg/75">
                    {r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={commit}
              disabled={busy === "commit" || !columns.part_number || !columns.unit_price || (!accountId && !columns.account)}
              className="btn-primary text-sm disabled:opacity-60"
              title={!accountId && !columns.account ? "Pick an account or map an account column" : undefined}
            >
              {busy === "commit" ? "Committing…" : "Commit agreements"}
            </button>
            <button type="button" onClick={() => setA(null)} className="btn-outline text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {err ? <p className="mt-2 text-xs text-danger">{err}</p> : null}
      {result ? (
        <div className="mt-2 text-xs text-fg/80">
          ✓ {result.inserted} agreement{result.inserted === 1 ? "" : "s"} written,{" "}
          {result.superseded} superseded, {result.skipped.length} row
          {result.skipped.length === 1 ? "" : "s"} skipped.
          {result.skipped.slice(0, 5).map((s) => (
            <div key={s.rowIndex} className="text-muted">row {s.rowIndex + 2}: {s.issue}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
