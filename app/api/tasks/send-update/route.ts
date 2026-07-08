import { NextResponse, type NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";
import { emails } from "@/lib/db/schema";
import { getTaskMeta, markCustomerUpdated } from "@/lib/taskMeta";
import {
  emailIdsForThreadKey,
  pickReplyTarget,
  type ReplyTargetMessage,
} from "@/lib/firehose/read";
import { markReplied } from "@/lib/firehose/actions";
import {
  postMailIntent,
  replyFlowConfigured,
  ReplyFlowNotConfiguredError,
} from "@/lib/powerAutomate";
import { identityFor, canDraftAs } from "@/lib/workstreams";
import { isWorkstream, type Workstream } from "@/lib/vault/types";
import { textToMailHtml, withQuotedHistory } from "@/lib/mailOut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Send a task's customer update INTO its linked email thread, through the same
// Flow B path as /api/reply (a real send, same as the thread reply box). The
// task must be linked to a thread first; we never guess recipients. On success
// the task's last_customer_update is stamped, so "Sent" here is always true.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const taskId: unknown = body?.taskId;
  const bodyText = String(body?.bodyText ?? "").trim();
  const workstream = String(body?.workstream ?? "merit");

  if (typeof taskId !== "string" || !taskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }
  if (!bodyText) {
    return NextResponse.json({ error: "Update body is empty." }, { status: 400 });
  }
  if (!isWorkstream(workstream)) {
    return NextResponse.json(
      { error: "A valid workstream is required to choose the from-identity." },
      { status: 400 },
    );
  }
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  if (!canDraftAs(workstream as Workstream)) {
    const identity = identityFor(workstream as Workstream);
    return NextResponse.json(
      {
        error: `No sending identity is configured for the "${workstream}" workstream (${identity.label}).`,
      },
      { status: 422 },
    );
  }
  if (!replyFlowConfigured()) {
    return NextResponse.json(
      { error: "Reply flow not configured (POWER_AUTOMATE_REPLY_URL unset)." },
      { status: 503 },
    );
  }

  const meta = await getTaskMeta([taskId]);
  const linkedThreadKey = meta.get(taskId)?.linkedThreadKey ?? null;
  if (!linkedThreadKey) {
    return NextResponse.json(
      {
        error:
          "This task has no linked email thread. Link a thread first (open the thread and use \"Link to a task\"), then send from here.",
      },
      { status: 422 },
    );
  }

  const ids = await emailIdsForThreadKey(linkedThreadKey);
  if (!ids.length) {
    return NextResponse.json(
      { error: "The linked thread no longer exists." },
      { status: 404 },
    );
  }
  const rows = await getDb().select().from(emails).where(inArray(emails.id, ids));
  const identity = identityFor(workstream as Workstream);
  const target = pickReplyTarget(
    rows as unknown as ReplyTargetMessage[],
    identity.email!,
  );
  if (!target) {
    return NextResponse.json(
      { error: "The linked thread has no inbound message to reply to." },
      { status: 422 },
    );
  }

  const baseSubject = (target.subject ?? "").trim() || "(no subject)";
  const subject = /^re:/i.test(baseSubject) ? baseSubject : `RE: ${baseSubject}`;

  // Quoted history rides along (Flow B replaces the draft body wholesale).
  const targetRow = rows.find((r) => r.messageId === target.messageId);
  const updateHtml = textToMailHtml(bodyText, identity.label, identity.email!);

  try {
    const result = await postMailIntent({
      action: "reply",
      inReplyTo: target.messageId,
      to: target.to,
      cc: target.cc,
      subject,
      bodyHtml: targetRow ? withQuotedHistory(updateHtml, targetRow) : updateHtml,
      fromIdentity: workstream as Workstream,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: `Flow B returned ${result.status}.`, detail: result.body },
        { status: 502 },
      );
    }
    await markReplied(target.emailId);
    await markCustomerUpdated(taskId);
    return NextResponse.json({ ok: true, to: target.to, cc: target.cc });
  } catch (err) {
    if (err instanceof ReplyFlowNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Send failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
