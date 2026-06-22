import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import {
  reclassifyMeeting,
  createAccount,
  WriteBackError,
} from "@/lib/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Link a meeting to an account or mark it internal, propagating fully (folder
// move + title + index). With create:true, scaffolds the account first.
// body: { path, account: string | null, create?: boolean }
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const account =
    typeof body?.account === "string" && body.account.trim()
      ? body.account.trim()
      : null;
  const create = body?.create === true;
  if (!path || !path.includes("/Meetings/") || !path.endsWith(".md")) {
    return NextResponse.json(
      { error: "A valid meeting note path is required." },
      { status: 400 },
    );
  }
  if (create && !account) {
    return NextResponse.json(
      { error: "An account name is required to create one." },
      { status: 400 },
    );
  }

  try {
    let accountSlug: string | undefined;
    if (create && account) {
      const acct = await createAccount(account);
      accountSlug = acct.slug;
    }
    const res = await reclassifyMeeting(path, account);
    return NextResponse.json({
      ok: true,
      commit: res.commitSha,
      path: res.path,
      moved: res.moved,
      account,
      accountSlug,
    });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
