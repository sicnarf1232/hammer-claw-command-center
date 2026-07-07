import { NextResponse, type NextRequest } from "next/server";
import { getThreadViewData } from "@/lib/inboxThread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full thread view payload as JSON: the same data the inbox thread page
// renders, for clients that want it without the HTML. Auth-gated like the
// rest of the app.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("key")?.trim() ?? "";
  if (!raw) return NextResponse.json({ error: "Pass ?key=<thread key>." }, { status: 400 });

  const key = decodeURIComponent(raw);
  const data = await getThreadViewData(key);
  if (!data) return NextResponse.json({ error: "Thread not found." }, { status: 404 });

  return NextResponse.json({ ok: true, ...data });
}
