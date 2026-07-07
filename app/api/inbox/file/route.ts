import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { isVaultConfigured, writeFile } from "@/lib/github";
import { cutoverActive } from "@/lib/dbSource";
import { getEmail, markFiled } from "@/lib/inbox";
import { buildInboxNote, FilingNotAllowedError } from "@/lib/filing";
import { isWorkstream } from "@/lib/vault/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// File a queued email into the correct workstream Inbox/ as a git commit.
// Reviewable, never automatic (docs/03).
export async function POST(req: NextRequest) {
  if (!dbConfigured() || !isVaultConfigured()) {
    return NextResponse.json(
      { error: "Database or vault access not configured." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  const workstream = String(body.workstream ?? "");
  const account = body.account ? String(body.account) : undefined;

  if (!isWorkstream(workstream)) {
    return NextResponse.json(
      { error: "A valid workstream is required to file." },
      { status: 400 },
    );
  }

  const email = await getEmail(body.id);
  if (!email) {
    return NextResponse.json({ error: "Email not found." }, { status: 404 });
  }
  if (email.status === "filed") {
    return NextResponse.json(
      { error: "Already filed.", path: email.filedPath },
      { status: 409 },
    );
  }

  try {
    const note = buildInboxNote(
      {
        messageId: email.messageId,
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        toAddrs: email.toAddrs,
        subject: email.subject,
        receivedAt: email.receivedAt,
        bodyText: email.bodyText,
        bodyPreview: email.bodyPreview,
        webLink: email.webLink,
      },
      workstream,
      account,
    );

    // Post-cutover: filing is a DB status change (the email row already holds
    // the full message; the vault note was a duplicate copy). Pre-cutover it
    // commits the note as before.
    if (await cutoverActive()) {
      await markFiled(email.id, note.path, "", workstream, account ?? null);
      return NextResponse.json({ ok: true, path: note.path, commit: "" });
    }

    const result = await writeFile({
      path: note.path,
      content: note.content,
      message: note.message,
    });

    await markFiled(
      email.id,
      result.path,
      result.commitSha,
      workstream,
      account ?? null,
    );

    return NextResponse.json({ ok: true, path: result.path, commit: result.commitSha });
  } catch (err) {
    if (err instanceof FilingNotAllowedError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : "Filing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
