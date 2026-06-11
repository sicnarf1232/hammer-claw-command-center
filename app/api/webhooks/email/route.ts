import { NextResponse, type NextRequest } from "next/server";
import { getDb, dbConfigured } from "@/lib/db";
import { emailQueue, webhookEvents, notifications } from "@/lib/db/schema";
import { safeEqual } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbound capture from Power Automate Flow A (docs/03). Verify signature,
// dedupe on messageId, log the raw event, enqueue with status "new".
export async function POST(req: NextRequest) {
  const secret = process.env.HC_WEBHOOK_SECRET;
  const sig = req.headers.get("x-hc-signature") ?? "";

  // 1) Verify the shared secret in constant time.
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
    return NextResponse.json(
      { error: "messageId is required." },
      { status: 400 },
    );
  }

  const db = getDb();

  // 3) Log the raw event (signature header itself is never stored).
  await db.insert(webhookEvents).values({
    messageId,
    signatureValid: true,
    kind: "email",
    payload: body,
  });

  const from = (body.from ?? {}) as { name?: string; email?: string };
  const receivedAt = parseDate(body.receivedAt);

  // 4) Enqueue. Dedupe on messageId via the unique index.
  const inserted = await db
    .insert(emailQueue)
    .values({
      messageId,
      receivedAt,
      fromName: strOrNull(from.name),
      fromEmail: strOrNull(from.email),
      toAddrs: strArray(body.to),
      cc: strArray(body.cc),
      subject: strOrNull(body.subject),
      bodyPreview: strOrNull(body.bodyPreview),
      bodyHtml: strOrNull(body.bodyHtml),
      bodyText: strOrNull(body.bodyText),
      hasAttachments: Boolean(body.hasAttachments),
      webLink: strOrNull(body.webLink),
      status: "new",
    })
    .onConflictDoNothing({ target: emailQueue.messageId })
    .returning({ id: emailQueue.id });

  const isNew = inserted.length > 0;

  // 5) Log an in-app notification for genuinely new mail.
  if (isNew) {
    await db.insert(notifications).values({
      kind: "new_email",
      title: "New flagged email",
      body: `${from.name ?? from.email ?? "Unknown"}: ${
        strOrNull(body.subject) ?? "(no subject)"
      }`,
      channel: "in-app",
      meta: { messageId, emailQueueId: inserted[0]?.id },
      dedupeKey: `new_email:${messageId}`,
    });
  }

  return NextResponse.json({ ok: true, deduped: !isNew });
}

function strOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v;
  return null;
}

function strArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
