import { NextResponse, type NextRequest } from "next/server";
import { desc, or, ilike, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only diagnostic: list stored messages matching an address/subject so we
// can tell a capture gap (message never arrived) from a threading split
// (arrived but under a different conversationId). Auth-gated like the rest.
export async function GET(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "Pass ?q=<address or subject>." }, { status: 400 });

  const like = `%${q}%`;
  const rows = await getDb()
    .select({
      id: emails.id,
      direction: emails.direction,
      fromEmail: emails.fromEmail,
      subject: emails.subject,
      threadId: emails.threadId,
      messageId: emails.messageId,
      sentAt: emails.sentAt,
      receivedAt: emails.receivedAt,
      createdAt: emails.createdAt,
      accountId: emails.accountId,
    })
    .from(emails)
    .where(
      or(
        ilike(emails.fromEmail, like),
        ilike(emails.subject, like),
        sql`${emails.toAddrs}::text ilike ${like}`,
      ),
    )
    .orderBy(desc(sql`coalesce(${emails.sentAt}, ${emails.receivedAt}, ${emails.createdAt})`))
    .limit(60);

  const threadIds = new Set(rows.map((r) => r.threadId ?? `m:${r.id}`));
  return NextResponse.json({
    ok: true,
    matched: rows.length,
    distinctThreads: threadIds.size,
    rows,
  });
}
