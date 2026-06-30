import { NextResponse, type NextRequest } from "next/server";
import { getDb, dbConfigured } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { safeEqual } from "@/lib/auth";
import { storeFirehoseEmail, slimAudit, type FirehosePayload } from "@/lib/firehose/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Attachments (base64 decode, Blob upload, PDF text) can take a moment.
export const maxDuration = 60;

// Email firehose (Milestone 4): every received AND sent Merit OEM message, via
// two Power Automate flows, lands here to build the brain. Separate from the
// flagged-triage webhook (/api/webhooks/email) so it does not flood the action
// queue. Verify the shared secret, dedupe on internetMessageId, store + link,
// return 200. The schema self-provisions on first call.
export async function POST(req: NextRequest) {
  const secret = process.env.HC_WEBHOOK_SECRET;
  const sig = req.headers.get("x-hc-signature") ?? "";

  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured (HC_WEBHOOK_SECRET unset)." },
      { status: 503 },
    );
  }
  if (!sig || sig.length !== secret.length || !safeEqual(sig, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json(
      { error: "Database not configured (POSTGRES_URL unset)." },
      { status: 503 },
    );
  }

  let body: FirehosePayload;
  try {
    body = (await req.json()) as FirehosePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.internetMessageId && !body.fromEmail && !body.subject) {
    return NextResponse.json(
      { error: "Empty payload (need at least internetMessageId)." },
      { status: 400 },
    );
  }

  try {
    const result = await storeFirehoseEmail(body);

    // Slim audit (no attachment bytes) for debuggability.
    try {
      await getDb().insert(webhookEvents).values({
        messageId: body.internetMessageId ?? null,
        signatureValid: true,
        kind: "email-firehose",
        payload: slimAudit(body),
      });
    } catch {
      /* audit is best-effort */
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[email-firehose] store failed:", err);
    // 500 lets Power Automate retry a transient failure.
    return NextResponse.json({ error: "Store failed." }, { status: 500 });
  }
}
