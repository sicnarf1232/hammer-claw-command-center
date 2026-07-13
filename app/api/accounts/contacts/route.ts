import { NextResponse, type NextRequest } from "next/server";
import { addAccountContacts, WriteBackError } from "@/lib/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manually add a contact to a customer account. Reuses the addAccountContacts
// writer (DB-first post-cutover: a people row with origin "app"). Idempotent:
// an already-listed name reports added: [] and writes nothing.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!path || !path.startsWith("300 Merit/Customers/")) {
    return NextResponse.json(
      { error: "A valid customer note path is required." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: "A contact name is required." }, { status: 400 });
  }
  try {
    const res = await addAccountContacts(path, [
      { name, title: title || undefined, email: email || undefined },
    ]);
    return NextResponse.json({ ok: true, added: res.added });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
