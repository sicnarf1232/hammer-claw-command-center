import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { setAccountNumber, WriteBackError } from "@/lib/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Set or clear the account_number frontmatter field on a customer note.
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const accountNumber =
    typeof body?.accountNumber === "string" ? body.accountNumber : "";
  if (!path || !path.startsWith("300 Merit/Customers/")) {
    return NextResponse.json(
      { error: "A valid customer note path is required." },
      { status: 400 },
    );
  }
  try {
    const res = await setAccountNumber(path, accountNumber);
    return NextResponse.json({ ok: true, commit: res.commitSha });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
