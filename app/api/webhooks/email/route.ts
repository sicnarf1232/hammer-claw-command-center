import { NextResponse, type NextRequest } from "next/server";
import { getDb, dbConfigured } from "@/lib/db";
import { webhookEvents, notifications } from "@/lib/db/schema";
import { safeEqual } from "@/lib/auth";
import { ingestFlagged } from "@/lib/firehose/flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Inbound capture for FLAGGED email (Power Automate Flow A). In the unified inbox
// there is no separate queue: a flag is just a firehose message marked
// flagged=true, so this lands the message in the same `emails` table the firehose
// uses and sets the flag. Verify the shared secret, dedupe on messageId, notify.
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messageId = strOrNull(body.messageId);
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required." }, { status: 400 });
  }

  const db = getDb();

  // Audit (no attachment bytes here; the flag payload carries none).
  await db
    .insert(webhookEvents)
    .values({ messageId, signatureValid: true, kind: "email-flagged", payload: body })
    .catch(() => {});

  const result = await ingestFlagged(body);

  // Notify on genuinely new flagged mail (not a re-flag of an existing message).
  if (!result.deduped) {
    const from = (body.from ?? {}) as { name?: string; email?: string };
    await db
      .insert(notifications)
      .values({
        kind: "new_email",
        title: "New flagged email",
        body: `${from.name ?? from.email ?? "Unknown"}: ${strOrNull(body.subject) ?? "(no subject)"}`,
        channel: "in-app",
        meta: { messageId, emailId: result.emailId },
        dedupeKey: `new_email:${messageId}`,
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, deduped: result.deduped, emailId: result.emailId });
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
