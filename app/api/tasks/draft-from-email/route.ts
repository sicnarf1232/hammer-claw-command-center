import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { getThread } from "@/lib/firehose/read";
import { isSelfAddress } from "@/lib/firehose/map";
import { formatEmailBody } from "@/lib/emailFormat";
import { ensureEmailExtraction } from "@/lib/emailExtraction";
import { aiConfigured, draftTaskFromEmail } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// dev-feedback #16 Part B: "Draft with AI" for CreateTaskInline's fallback
// path (a thread has no good existing task to link, but the email suggests
// Jordan needs to do something). Finds the thread's latest inbound message
// the same way lib/inboxThread.ts's getThreadViewData does, reuses its cached
// ask/provide extraction (lib/emailExtraction.ts, dev-feedback #14), then asks
// the model for a well-formed NEW task. Display-only: Jordan reviews and edits
// before hitting Create, nothing here writes a task.
// body: { threadKey, accountName? }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI drafting is not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const threadKey = typeof body?.threadKey === "string" ? body.threadKey.trim() : "";
  if (!threadKey) {
    return NextResponse.json({ error: "threadKey is required." }, { status: 400 });
  }
  const accountName =
    typeof body?.accountName === "string" && body.accountName.trim()
      ? body.accountName.trim()
      : null;

  try {
    const { subject, messages } = await getThread(threadKey);
    if (!messages.length) {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }
    // Same inbound rule as lib/inboxThread.ts's getThreadViewData: a message
    // tagged outbound, or one sent from Jordan's own address even if the
    // capture flow missed the tag, is never the drafting source.
    const latestInbound = [...messages]
      .reverse()
      .find((m) => m.direction !== "outbound" && !(m.fromEmail && isSelfAddress(m.fromEmail)));
    if (!latestInbound) {
      return NextResponse.json(
        { error: "No inbound message in this thread to draft from." },
        { status: 422 },
      );
    }

    const bodyText = formatEmailBody(latestInbound).main;
    const extraction = await ensureEmailExtraction(latestInbound.id, subject, bodyText).catch(
      () => null,
    );
    const draft = await draftTaskFromEmail({
      subject,
      bodyText,
      accountName,
      extractedAsks: extraction?.asks ?? [],
      extractedProvides: extraction?.provides ?? [],
    });
    return NextResponse.json({ ok: true, ...draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Draft failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
