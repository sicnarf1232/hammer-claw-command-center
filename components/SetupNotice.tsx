import { AlertIcon } from "./icons";

export default function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="card max-w-2xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <AlertIcon className="h-4 w-4 text-warning" />
        Almost there: a few environment values are needed
      </h2>
      <p className="mt-2 text-sm text-fg/75">
        This page reads the live vault, which needs the GitHub token and repo
        configured. Set these in Vercel project settings (or .env.local for local
        dev), then reload.
      </p>
      <ul className="mt-3 space-y-1.5">
        {missing.map((m) => (
          <li key={m} className="flex items-center gap-2 text-sm text-fg/75">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            <code className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-xs text-fg">
              {m}
            </code>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        See <code className="font-mono">.env.example</code> and{" "}
        <code className="font-mono">PUNCHLIST.md</code> for the full list and
        exact steps.
      </p>
    </div>
  );
}
