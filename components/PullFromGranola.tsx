"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PullStaged {
  title: string;
  path: string;
  bucket: string;
  workstream: string;
  action: "staged" | "refreshed";
}
interface PullResult {
  ok: true;
  staged: PullStaged[];
  seriesStaged: { series: string; date: string }[];
  alreadyPending: number;
  skipped: { title: string; reason: string }[];
  errors: { title: string; error: string }[];
  truncated: boolean;
}

// "Pull from Granola" button for /meetings. Calls /api/meetings/pull, which
// stages recent Granola meetings as proposals for review. Nothing is written
// to the vault until each proposal is approved in the queue below.
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
        if (data.staged?.length) router.refresh();
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
        title="Stage recent Granola meetings as proposals to review"
      >
        {busy ? "Pulling from Granola…" : "Pull from Granola"}
      </button>

      {err && <p className="text-xs text-danger">{err}</p>}

      {result && (
        <div className="card max-w-md p-3 text-xs">
          <div className="font-medium text-fg">
            {result.staged.length
              ? `Staged ${result.staged.length} proposal${result.staged.length === 1 ? "" : "s"} for review. Nothing is filed until you approve.`
              : "No new meetings to stage."}
          </div>
          {result.staged.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-muted">
              {result.staged.map((f) => (
                <li key={f.path} className="truncate">
                  <span className="text-fg">{f.title}</span>{" "}
                  <span className="text-muted">
                    · {f.bucket} · {f.workstream}
                    {f.action === "refreshed" ? " · refreshed" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.seriesStaged?.length > 0 && (
            <div className="mt-1.5 text-muted">
              {result.seriesStaged.length} rolling-series update
              {result.seriesStaged.length === 1 ? "" : "s"} staged:{" "}
              <span className="text-fg">
                {Array.from(
                  new Set(result.seriesStaged.map((s) => s.series)),
                ).join(", ")}
              </span>
            </div>
          )}
          {result.alreadyPending > 0 && (
            <div className="mt-1.5 text-muted">
              {result.alreadyPending} already awaiting review.
            </div>
          )}
          {result.skipped.length > 0 && (
            <div className="mt-1.5 text-muted">
              Skipped {result.skipped.length} (already in the vault or
              previously decided).
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
