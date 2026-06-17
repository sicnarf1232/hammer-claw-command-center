"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PullFiled {
  title: string;
  path: string;
  bucket: string;
  workstream: string;
}
interface PullResult {
  ok: true;
  filed: PullFiled[];
  skipped: { title: string; reason: string }[];
  errors: { title: string; error: string }[];
  seriesUpdated: { series: string; date: string }[];
  truncated: boolean;
}

// "Pull from Granola" button for /meetings. Calls /api/meetings/pull, which
// triages recent Granola meetings into the vault, then refreshes the list.
export default function PullFromGranola() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PullResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pull() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/meetings/pull", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Pull failed.");
      } else {
        setResult(data as PullResult);
        if (data.filed?.length) router.refresh();
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={pull}
        disabled={busy}
        className="btn btn-primary cursor-pointer disabled:opacity-60"
        title="Pull recent meetings from Granola into the vault"
      >
        {busy ? "Pulling from Granola…" : "Pull from Granola"}
      </button>

      {err && <p className="text-xs text-danger">{err}</p>}

      {result && (
        <div className="card max-w-md p-3 text-xs">
          <div className="font-medium text-fg">
            {result.filed.length
              ? `Filed ${result.filed.length} meeting${result.filed.length === 1 ? "" : "s"}.`
              : "No new meetings to file."}
          </div>
          {result.filed.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-muted">
              {result.filed.map((f) => (
                <li key={f.path} className="truncate">
                  <span className="text-fg">{f.title}</span>{" "}
                  <span className="text-muted">
                    · {f.bucket} · {f.workstream}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.seriesUpdated?.length > 0 && (
            <div className="mt-1.5 text-muted">
              Updated {result.seriesUpdated.length} rolling series:{" "}
              <span className="text-fg">
                {Array.from(
                  new Set(result.seriesUpdated.map((s) => s.series)),
                ).join(", ")}
              </span>
            </div>
          )}
          {result.skipped.length > 0 && (
            <div className="mt-1.5 text-muted">
              Skipped {result.skipped.length} already in the vault.
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="mt-1.5 text-danger">
              {result.errors.length} error
              {result.errors.length === 1 ? "" : "s"}:{" "}
              {result.errors.map((e) => e.title).join(", ")}
            </div>
          )}
          {result.truncated && (
            <div className="mt-1.5 text-muted">
              Hit the per-pull cap. Press again to continue.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
