import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { getEmailById, markReplied } from "@/lib/firehose/actions";
import { draftReply, aiConfigured, AiNotConfiguredError } from "@/lib/ai";
import { getVoiceProfile, voiceInstructions } from "@/lib/voice";
import { retrieveDraftContext } from "@/lib/firehose/draftContext";
import { accountNames } from "@/lib/firehose/read";
import {
  postMailIntent,
  replyFlowConfigured,
  ReplyFlowNotConfiguredError,
} from "@/lib/powerAutomate";
import { identityFor, canDraftAs } from "@/lib/workstreams";
import { isWorkstream, type Workstream } from "@/lib/vault/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two modes:
//   mode "generate" -> AI-drafts a reply body, returns it for Jordan to edit.
//   mode "draft"    -> sends a create_draft intent to Flow B (Outlook draft).
// Auto-send is intentionally not exposed here: the app only ever creates drafts
// that Jordan reviews and sends from Outlook (docs/03).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  const mode = body.mode === "draft" ? "draft" : "generate";
  const workstream = String(body.workstream ?? "");
  if (!isWorkstream(workstream)) {
    return NextResponse.json(
      { error: "A valid workstream is required to choose the from-identity." },
      { status: 400 },
    );
  }
  if (!dbConfigured()) {
    return NextResponse.json(
      { error: "Database not configured." },
      { status: 503 },
    );
  }

  const email = await getEmailById(body.id);
  if (!email) {
    return NextResponse.json({ error: "Email not found." }, { status: 404 });
  }

  if (mode === "generate") {
    if (!aiConfigured()) {
      return NextResponse.json(
        { error: "AI drafting unavailable (ANTHROPIC_API_KEY unset). Write the reply yourself." },
        { status: 503 },
      );
    }
    try {
      const voice = voiceInstructions(await getVoiceProfile());
      const acctName =
        email.accountId != null
          ? (await accountNames([email.accountId])).get(email.accountId)?.name ?? null
          : null;
      const threadText = `${email.subject ?? ""}\n${email.bodyText ?? email.bodyPreview ?? ""}`;
      const context = await retrieveDraftContext(threadText, acctName).catch(() => "");
      const draft = await draftReply({
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        subject: email.subject,
        bodyText: email.bodyText ?? email.bodyPreview,
        workstream: workstream as Workstream,
        instructions: typeof body.instructions === "string" ? body.instructions : undefined,
        voice,
        account: acctName,
        context,
      });
      return NextResponse.json({ ok: true, body: draft });
    } catch (err) {
      if (err instanceof AiNotConfiguredError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      const message = err instanceof Error ? err.message : "Drafting failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // mode === "draft": create an Outlook draft via Flow B.
  if (!canDraftAs(workstream as Workstream)) {
    const identity = identityFor(workstream as Workstream);
    return NextResponse.json(
      {
        error: `No sending identity is configured for the "${workstream}" workstream (${identity.label}). Provide its from-address before drafting as ${identity.label}.`,
      },
      { status: 422 },
    );
  }
  if (!replyFlowConfigured()) {
    return NextResponse.json(
      { error: "Reply flow not configured (POWER_AUTOMATE_REPLY_URL unset). Build Flow B first." },
      { status: 503 },
    );
  }

  // The rich editor sends bodyHtml (already formatted, greeting + sign-off
  // included by the voice-aware draft). Legacy/plain callers send bodyText, which
  // we escape and wrap with the identity signature.
  const identity = identityFor(workstream as Workstream);
  const rawHtml = typeof body.bodyHtml === "string" ? body.bodyHtml.trim() : "";
  const rawText = String(body.bodyText ?? "").trim();
  if (!rawHtml && !rawText) {
    return NextResponse.json({ error: "Reply body is empty." }, { status: 400 });
  }
  const bodyHtml = rawHtml
    ? sanitizeHtml(rawHtml)
    : toHtml(rawText, identity.label, identity.email!);

  const subject = String(body.subject ?? "").trim() ||
    `RE: ${email.subject ?? "(no subject)"}`;
  // Reply-all: the client passes the full recipient set (to + cc). Fall back to
  // just the sender for a plain reply.
  const to =
    Array.isArray(body.to) && body.to.length
      ? body.to.map((x: unknown) => String(x))
      : email.fromEmail
        ? [email.fromEmail]
        : [];
  const cc = Array.isArray(body.cc) ? body.cc.map((x: unknown) => String(x)) : [];

  try {
    const result = await postMailIntent({
      action: "reply",
      inReplyTo: email.messageId ?? "",
      to,
      cc,
      subject,
      bodyHtml,
      fromIdentity: workstream as Workstream,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: `Flow B returned ${result.status}.`, detail: result.body },
        { status: 502 },
      );
    }
    await markReplied(email.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReplyFlowNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Reply failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Keep the editor's HTML to a safe, mail-friendly subset. Drop script/style and
// event handlers; the draft is created in Jordan's own Outlook, but we still send
// clean markup. The rich reply body already carries its own greeting/sign-off.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

// Convert a plain-text reply into simple HTML with a signature block.
function toHtml(text: string, name: string, email: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const bodyHtml = escaped.replace(/\n/g, "<br>");
  const sig = `Jordan Francis<br>${name}<br>${email}`;
  return `<div>${bodyHtml}</div><br><div>${sig}</div>`;
}
