import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { setMeetingClassification, WriteBackError } from "@/lib/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Quick link/internal toggle: set or clear a meeting note's customer link.
// body: { path, account: string | null }  (account null => mark internal)
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
  if (!path || !path.includes("/Meetings/") || !path.endsWith(".md")) {
    return NextResponse.json(
      { error: "A valid meeting note path is required." },
      { status: 400 },
    );
  }
  try {
    const res = await setMeetingClassification(path, account);
    return NextResponse.json({ ok: true, commit: res.commitSha, account });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
