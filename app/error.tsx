"use client";

// Global error boundary so an unhandled render/server error shows a recoverable
// card instead of a blank screen. Vault reads (GitHub) can fail transiently;
// "Try again" re-runs the segment.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="card border-danger/30 p-6">
        <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted">
          This page hit an error. It is often a transient vault or network read.
          Try again, or go back to Today.
        </p>
        {error?.message && (
          <pre className="mt-3 overflow-x-auto rounded-lg bg-surface2 p-3 text-xs text-ink2">
            {error.message}
          </pre>
        )}
        <div className="mt-4 flex items-center gap-2">
          <button onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <a href="/today" className="btn btn-ghost">
            Go to Today
          </a>
        </div>
      </div>
    </div>
  );
}
