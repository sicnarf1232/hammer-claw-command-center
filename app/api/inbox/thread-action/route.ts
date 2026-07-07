import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { emailIdsForThreadKey } from "@/lib/firehose/read";
import { setFlag, setStatus } from "@/lib/firehose/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const ids = await emailIdsForThreadKey(key);
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
