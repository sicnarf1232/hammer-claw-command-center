import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { setFlag, setStatus } from "@/lib/firehose/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Thread actions for the unified inbox: flag/unflag (the Outlook-style "act on
// this" marker) and archive/unarchive. Applies to every message id in a thread.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const ids: unknown = body?.ids;
  const action: unknown = body?.action;
  if (!Array.isArray(ids) || ids.some((n) => !Number.isInteger(n))) {
    return NextResponse.json({ error: "ids (number[]) is required." }, { status: 400 });
  }
  if (action !== "flag" && action !== "unflag" && action !== "archive" && action !== "unarchive") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const idList = ids as number[];
  try {
    for (const id of idList) {
      if (action === "flag") await setFlag(id, true);
      else if (action === "unflag") await setFlag(id, false);
      else if (action === "archive") await setStatus(id, "archived");
      else await setStatus(id, "new");
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[inbox/action] failed:", err);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
}
