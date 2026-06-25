import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { buildShareHtml } from "@/lib/meetingExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The client-branded Copy-for-email HTML, rendered from the shared template.
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : undefined;
  const seriesPath = typeof body?.seriesPath === "string" ? body.seriesPath : undefined;

  try {
    const result = await buildShareHtml({ path, seriesPath });
    if (!result) {
      return NextResponse.json(
        { error: "Provide a valid meeting `path` or `seriesPath`." },
        { status: 400 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to render share HTML.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
