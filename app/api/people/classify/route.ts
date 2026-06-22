import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { setPersonClassification, WriteBackError } from "@/lib/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Edit a person: set internal (merit) vs customer, and for customers their
// account. Writes an authoritative roster Team Override.
// body: { name, classification: "merit" | "customer", account?: string | null }
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const classification =
    body?.classification === "customer" ? "customer" : "merit";
  const account =
    typeof body?.account === "string" && body.account.trim()
      ? body.account.trim()
      : null;
  if (!name) {
    return NextResponse.json({ error: "A person name is required." }, { status: 400 });
  }
  try {
    const res = await setPersonClassification(name, classification, account);
    return NextResponse.json({ ok: true, commit: res.commitSha });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
