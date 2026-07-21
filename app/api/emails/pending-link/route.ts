import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { createPendingLink } from "@/lib/pendingTaskLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Queue task links for a NEW outbound email that has no `emails` row yet
// (dev-feedback #15, part 3). The compose page calls this right after a
// successful send when Jordan picked task(s) via TaskLinkPicker; the
// outbound-capture webhook reconciles it once the real row lands
// (lib/pendingTaskLinks.ts's reconcilePendingTaskLinks, called from
// lib/firehose/store.ts). Best-effort, not a guarantee: see that module's
// header for the edge cases this does not try to handle.
// body: { subject: string, to: string[], taskIds: string[] }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const subject = typeof b.subject === "string" ? b.subject : "";
  const to = Array.isArray(b.to) ? b.to.map((x) => String(x)) : [];
  const taskIds = Array.isArray(b.taskIds) ? b.taskIds.map((x) => String(x)) : [];
  if (!taskIds.length) {
    return NextResponse.json({ error: "At least one taskId is required." }, { status: 400 });
  }

  try {
    await createPendingLink(subject, to, taskIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to queue the pending link." },
      { status: 500 },
    );
  }
}
