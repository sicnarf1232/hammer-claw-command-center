import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { recentNotifications } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backs the notification bell's dropdown (dev-feedback #20 Part A): the most
// recent handful of notifications, each individually clickable via
// lib/notifyLink's notificationHref on the client. A "See all" link in the
// dropdown still goes to /notifications for the full list.
export async function GET(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ ok: true, items: [] });

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 8;

  try {
    const rows = await recentNotifications(limit);
    const items = rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      meta: n.meta,
      createdAt: n.createdAt,
    }));
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
}
