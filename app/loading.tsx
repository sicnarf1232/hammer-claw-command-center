// Global route-loading skeleton. The vault pages read from GitHub, so a quick
// shimmer during navigation makes the app feel responsive instead of frozen.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-7 w-40 rounded-md bg-surface2" />
        <div className="mt-2 h-4 w-72 rounded bg-surface2" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card h-14 p-3">
            <div className="h-4 w-1/3 rounded bg-surface2" />
            <div className="mt-2 h-3 w-1/4 rounded bg-surface2" />
          </div>
        ))}
      </div>
    </div>
  );
}
