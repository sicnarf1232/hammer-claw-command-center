import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { linkSenderToAccount } from "@/lib/firehose/senderSuggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Link an unmapped sender address to an account (creates/maps the contact and
// backfills their mail onto the account).
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const address: unknown = body?.address;
  const accountId: unknown = body?.accountId;
  if (typeof address !== "string" || !address.includes("@")) {
    return NextResponse.json({ error: "A valid address is required." }, { status: 400 });
  }
  if (!Number.isInteger(accountId)) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }
  try {
    await linkSenderToAccount(address, accountId as number, typeof body?.name === "string" ? body.name : null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[inbox/link-sender] failed:", err);
    return NextResponse.json({ error: "Link failed." }, { status: 500 });
  }
}
