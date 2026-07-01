import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { getEmailById, markReplied } from "@/lib/firehose/actions";
import { draftReply, aiConfigured } from "@/lib/ai";
import { getVoiceProfile, voiceInstructions } from "@/lib/voice";
import { retrieveDraftContext } from "@/lib/firehose/draftContext";
import { accountNames } from "@/lib/firehose/read";
import {
  postMailIntent,
  replyFlowConfigured,
  type MailIntent,
  type OutAttachment,
} from "@/lib/powerAutomate";
import { gatherAttachments, type AttachmentRef } from "@/lib/mailOut";
import { identityFor, canDraftAs } from "@/lib/workstreams";
import { isWorkstream, type Workstream } from "@/lib/vault/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Compose a NEW email or FORWARD one, with attachments. Reply stays on /api/reply.
// mode "generate" -> AI-drafts an HTML body; mode "send" -> creates an Outlook
// draft via Flow B. Always a draft Jordan reviews; never auto-send.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const action = b.action === "forward" ? "forward" : "new";
  const mode = b.mode === "send" ? "send" : "generate";
  const workstream = String(b.workstream ?? "merit");
  if (!isWorkstream(workstream)) {
    return NextResponse.json({ error: "A valid workstream is required." }, { status: 400 });
  }

  // Forward carries a source email for context + threading.
  const forwardId = typeof b.forwardId === "number" ? b.forwardId : null;
  const source = forwardId != null ? await getEmailById(forwardId) : null;
  if (action === "forward" && !source) {
    return NextResponse.json({ error: "Original email not found to forward." }, { status: 404 });
  }

  if (mode === "generate") {
    if (!aiConfigured()) {
      return NextResponse.json({ error: "AI drafting unavailable." }, { status: 503 });
    }
    const voice = voiceInstructions(await getVoiceProfile());
    const acctName =
      source?.accountId != null
        ? (await accountNames([source.accountId])).get(source.accountId)?.name ?? null
        : null;
    const subjectText = String(b.subject ?? source?.subject ?? "");
    const steerText = typeof b.instructions === "string" ? b.instructions : "";
    const threadText = `${subjectText}\n${steerText}\n${source?.bodyText ?? source?.bodyPreview ?? ""}`;
    const context = await retrieveDraftContext(threadText, acctName).catch(() => "");
    const draft = await draftReply({
      kind: action,
      fromName: source?.fromName,
      fromEmail: source?.fromEmail,
      subject: subjectText,
      bodyText: source?.bodyText ?? source?.bodyPreview ?? null,
      workstream: workstream as Workstream,
      instructions: steerText || undefined,
      voice,
      account: acctName,
      context,
    });
    return NextResponse.json({ ok: true, body: draft });
  }

  // mode === "send"
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  if (!canDraftAs(workstream as Workstream)) {
    const identity = identityFor(workstream as Workstream);
    return NextResponse.json(
      { error: `No sending identity configured for ${identity.label}.` },
      { status: 422 },
    );
  }
  if (!replyFlowConfigured()) {
    return NextResponse.json(
      { error: "Mail flow not configured (POWER_AUTOMATE_REPLY_URL unset)." },
      { status: 503 },
    );
  }

  const to = strList(b.to);
  const cc = strList(b.cc);
  const bcc = strList(b.bcc);
  if (!to.length) {
    return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });
  }
  const bodyHtml = typeof b.bodyHtml === "string" ? b.bodyHtml.trim() : "";
  if (!bodyHtml) {
    return NextResponse.json({ error: "The message body is empty." }, { status: 400 });
  }
  const subject =
    String(b.subject ?? "").trim() ||
    (action === "forward" ? `FW: ${source?.subject ?? ""}` : "(no subject)");

  // Gather attachments. For a forward, Flow B's createForward keeps the ORIGINAL
  // files automatically, so we only send any extras the user added.
  const refs = parseRefs(b.attachments);
  let attachments: OutAttachment[] = [];
  try {
    attachments = await gatherAttachments(refs);
  } catch {
    attachments = [];
  }

  const intent: MailIntent = {
    action,
    inReplyTo: action === "forward" ? source?.messageId ?? undefined : undefined,
    to,
    cc,
    bcc,
    subject,
    bodyHtml,
    fromIdentity: workstream as Workstream,
    attachments: attachments.length ? attachments : undefined,
  };

  try {
    const result = await postMailIntent(intent);
    if (!result.ok) {
      return NextResponse.json(
        { error: `Flow B returned ${result.status}.`, detail: result.body },
        { status: 502 },
      );
    }
    if (action === "forward" && source) await markReplied(source.id).catch(() => {});
    return NextResponse.json({ ok: true, attachments: attachments.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function parseRefs(v: unknown): AttachmentRef[] {
  if (!Array.isArray(v)) return [];
  const out: AttachmentRef[] = [];
  for (const item of v) {
    const o = (item ?? {}) as Record<string, unknown>;
    if (o.kind === "document" && typeof o.id === "number") out.push({ kind: "document", id: o.id });
    else if (o.kind === "emailAttachment" && typeof o.id === "number")
      out.push({ kind: "emailAttachment", id: o.id });
    else if (o.kind === "upload" && typeof o.base64 === "string")
      out.push({
        kind: "upload",
        name: String(o.name ?? "attachment"),
        contentType: typeof o.contentType === "string" ? o.contentType : undefined,
        base64: o.base64,
      });
  }
  return out;
}
