import { NextResponse, type NextRequest } from "next/server";
import { createAccount, editAccountNote, WriteBackError } from "@/lib/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manually add a customer account. Reuses the createAccount writer (DB-first
// post-cutover, origin "app"); an optional account number and overview note
// ride along via the existing editAccountNote writer. 409 when the account
// already exists so a manual add never clobbers a live account.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const accountNumber =
    typeof body?.accountNumber === "string" ? body.accountNumber.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "An account name is required." }, { status: 400 });
  }
  try {
    const res = await createAccount(name);
    if (!res.created) {
      return NextResponse.json(
        { error: "An account with that name already exists.", slug: res.slug },
        { status: 409 },
      );
    }
    if (accountNumber || note) {
      // Fresh account: type/status mirror what createAccount just wrote, and
      // there are no contacts yet, so the full-edit writer is safe here.
      await editAccountNote(res.path, {
        type: "Customer",
        status: "Prospect",
        accountNumber: accountNumber || undefined,
        overview: note,
        contacts: [],
      });
    }
    return NextResponse.json({ ok: true, slug: res.slug, path: res.path });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Create failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
