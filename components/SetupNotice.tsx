export default function SetupNotice({
  missing,
}: {
  missing: string[];
}) {
  return (
    <div className="card max-w-2xl p-5">
      <h2 className="text-sm font-semibold text-slate-900">
        Almost there: a few environment values are needed
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        This page reads the live vault, which needs the GitHub token and repo
        configured. Set these in Vercel project settings (or .env.local for
        local dev), then reload.
      </p>
      <ul className="mt-3 list-inside list-disc text-sm text-slate-700">
        {missing.map((m) => (
          <li key={m}>
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{m}</code>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        See <code className="text-xs">.env.example</code> and{" "}
        <code className="text-xs">PUNCHLIST.md</code> for the full list and exact
        steps.
      </p>
    </div>
  );
}
