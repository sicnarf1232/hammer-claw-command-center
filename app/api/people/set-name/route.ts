import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { dbSetPersonName } from "@/lib/peopleDb";
import { validateSetName } from "@/lib/peopleName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Correct a sender's display name (dev-feedback #17): an unmapped external
// contact (e.g. a raw mailbox alias like "Mvanega3") can be fixed from the
// thread itself, with no account or classification required. Upserts the
// people row by email; classification/account stay editable separately via
// PersonClassifier.
// body: { email: string, fullName: string }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const result = validateSetName({ email: body?.email, fullName: body?.fullName });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  try {
    const { id } = await dbSetPersonName(result.value.email, result.value.fullName);
    return NextResponse.json({ ok: true, id, fullName: result.value.fullName });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Write failed." },
      { status: 500 },
    );
  }
}
