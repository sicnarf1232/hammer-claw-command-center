import { NextResponse, type NextRequest } from "next/server";
import {
  vaultConfigured,
  getMeetingNoteByPath,
  getRoster,
} from "@/lib/vault";
import { findAccountByName } from "@/lib/accounts";
import { resolveAttendees } from "@/lib/contacts";
import { addAccountContacts, WriteBackError } from "@/lib/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase B: resolve a meeting's attendees against its account and auto-create
// any missing customer contacts on the account note (one commit).
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const notePath = typeof body?.notePath === "string" ? body.notePath : "";
  if (!notePath || !notePath.includes("/Meetings/")) {
    return NextResponse.json(
      { error: "A valid meeting-note path is required." },
      { status: 400 },
    );
  }

  try {
    const note = await getMeetingNoteByPath(notePath);
    if (!note) {
      return NextResponse.json({ error: "Meeting note not found." }, { status: 404 });
    }
    const accountName = note.customer?.basename;
    if (!accountName) {
      return NextResponse.json(
        { error: "Assign an account to this meeting first (Edit)." },
        { status: 400 },
      );
    }
    const [account, roster] = await Promise.all([
      findAccountByName(accountName),
      getRoster().catch(() => new Map()),
    ]);
    if (!account) {
      return NextResponse.json(
        { error: `No account note found for "${accountName}".` },
        { status: 404 },
      );
    }

    const resolutions = resolveAttendees(
      note.attendees,
      account.contacts.map((c) => c.name),
      roster,
    );
    const toCreate = resolutions
      .filter((r) => r.willCreate)
      .map((r) => ({ name: r.name }));

    let added: string[] = [];
    let commit = "";
    if (toCreate.length) {
      const res = await addAccountContacts(account.path, toCreate);
      added = res.added;
      commit = res.commitSha;
    }

    return NextResponse.json({
      ok: true,
      account: account.name,
      added,
      commit,
      skipped: resolutions.filter((r) => r.alreadyContact).map((r) => r.name),
    });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
