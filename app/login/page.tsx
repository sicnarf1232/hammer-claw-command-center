export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-20 max-w-sm">
      <div className="card p-6">
        <h1 className="text-base font-semibold text-slate-900">Hammer Claw</h1>
        <p className="mt-1 text-sm text-slate-500">
          Command Center. Single user.
        </p>
        <form action="/api/login" method="post" className="mt-4 grid gap-3">
          <input type="hidden" name="next" value={sp.next ?? "/today"} />
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Sign in
          </button>
          {sp.error && (
            <p className="text-xs text-red-600">Incorrect password.</p>
          )}
        </form>
      </div>
    </div>
  );
}
