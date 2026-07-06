import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";
import { emails } from "@/lib/db/schema";
import { setFlag, setStatus } from "@/lib/firehose/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve a thread key ("t:<threadId>" | "m:<id>") to its message ids, so the
// inbox list's hover actions can act on a whole thread without shipping ids to
// the client.
async function idsForKey(key: string): Promise<number[]> {
  if (key.startsWith("m:")) {
    const id = Number(key.slice(2));
    return Number.isInteger(id) ? [id] : [];
  }
  if (key.startsWith("t:")) {
    const threadId = key.slice(2);
    const rows = await getDb()
      .select({ id: emails.id })
      .from(emails)
      .where(eq(emails.threadId, threadId));
    return rows.map((r) => r.id);
  }
  return [];
}

// Key-addressable thread actions for the inbox list: flag/unflag and
// archive/unarchive across every message in the thread.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const key: unknown = body?.key;
  const action: unknown = body?.action;
  if (typeof key !== "string" || !key) {
    return NextResponse.json({ error: "key is required." }, { status: 400 });
  }
  if (action !== "flag" && action !== "unflag" && action !== "archive" && action !== "unarchive") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    const ids = await idsForKey(key);
    if (!ids.length) {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }
    for (const id of ids) {
      if (action === "flag") await setFlag(id, true);
      else if (action === "unflag") await setFlag(id, false);
      else if (action === "archive") await setStatus(id, "archived");
      else await setStatus(id, "new");
    }
    return NextResponse.json({ ok: true, count: ids.length });
  } catch (err) {
    console.error("[inbox/thread-action] failed:", err);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
}
