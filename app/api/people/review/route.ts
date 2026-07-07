import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { resolveReviewPerson } from "@/lib/peopleDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve a who-is-who review-queue entry (DB-CUTOVER stage 3).
// body: { id, dismiss: true } or { id, classification: "internal"|"customer", accountId? }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  try {
    if (body?.dismiss === true) {
      await resolveReviewPerson(id, { kind: "dismiss" });
      return NextResponse.json({ ok: true });
    }
    const classification = body?.classification;
    if (classification !== "internal" && classification !== "customer") {
      return NextResponse.json(
        { error: "classification must be internal or customer (or pass dismiss: true)." },
        { status: 400 },
      );
    }
    const accountId = Number.isInteger(body?.accountId) ? Number(body.accountId) : null;
    await resolveReviewPerson(id, { kind: "classify", classification, accountId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
