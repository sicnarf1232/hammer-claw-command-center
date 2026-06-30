export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="display-title text-xl text-fg">Hammer Claw</h1>
        <p className="mt-1 text-sm text-muted">
          Command Center. Single user.
        </p>
        <form action="/api/login" method="post" className="mt-5 grid gap-3">
          <input type="hidden" name="next" value={sp.next ?? "/today"} />
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            className="input"
          />
          <button type="submit" className="btn btn-primary w-full cursor-pointer">
            Sign in
          </button>
          {sp.error && (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              Incorrect password.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
