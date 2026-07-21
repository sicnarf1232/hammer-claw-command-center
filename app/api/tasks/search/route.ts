import { NextResponse, type NextRequest } from "next/server";
import { searchOpenTasks } from "@/lib/taskSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Search open tasks by title/account text for the manual "link to task(s)"
// picker (dev-feedback #15, components/TaskLinkPicker.tsx). Read-only,
// capped. GET /api/tasks/search?q=<text>
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const results = await searchOpenTasks(q, 20);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed." },
      { status: 500 },
    );
  }
}
