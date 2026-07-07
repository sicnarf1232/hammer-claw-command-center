"use client";

import { useState } from "react";

type Scope = "all" | "accounts" | "meetings" | "series" | "tasks" | "index";

interface ExportResponse {
  ok?: boolean;
  written?: string[];
  skipped?: number;
  errors?: Array<{ path: string; error: string }>;
  error?: string;
}

// The deliberate vault export (Settings). After the cutover, this is the ONLY
// thing that writes the vault: it renders the DB back to canonical markdown
// and commits changed files. Safe to re-run; unchanged files are skipped.
export default function ExportCard() {
  const [scope, setScope] = useState<Scope>("all");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ExportResponse | null>(null);

  async function runExport() {
    if (busy) return;
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, confirm: true }),
      });
      setRes(await r.json().catch(() => ({ error: "Bad response." })));
    } catch {
      setRes({ error: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6 p-4">
      <div className="eyebrow text-muted">Vault export</div>
      <p className="mt-1 text-sm text-muted">
        Render the app database back into vault markdown and commit the
        changes. This is the only path that writes the vault; run it whenever
        you want Obsidian to catch up.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          className="input px-2 py-1.5 text-sm"
        >
          <option value="all">Everything</option>
          <option value="accounts">Accounts</option>
          <option value="meetings">Meetings</option>
          <option value="series">Rolling series</option>
          <option value="tasks">Tasks</option>
          <option value="index">Meetings index</option>
        </select>
        <button
          type="button"
          onClick={runExport}
          disabled={busy}
          className="btn-primary text-sm disabled:opacity-60"
        >
          {busy ? "Exporting…" : "Export to vault"}
        </button>
      </div>
      {res ? (
        <div className="mt-3 text-xs">
          {res.error ? (
            <p className="text-danger">{res.error}</p>
          ) : (
            <>
              <p className="text-fg">
                Committed {res.written?.length ?? 0} file
                {(res.written?.length ?? 0) === 1 ? "" : "s"}; {res.skipped ?? 0}{" "}
                already up to date.
              </p>
              {res.written && res.written.length > 0 && (
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto text-muted">
                  {res.written.map((p) => (
                    <li key={p} className="truncate">{p}</li>
                  ))}
                </ul>
              )}
              {res.errors && res.errors.length > 0 && (
                <p className="mt-1 text-danger">
                  {res.errors.length} failed: {res.errors.map((e) => e.path).join(", ")}
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
