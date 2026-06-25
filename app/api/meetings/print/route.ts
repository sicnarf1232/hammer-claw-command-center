import { type NextRequest, NextResponse } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { buildShareHtml } from "@/lib/meetingExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase 3 step 2: the Download-PDF path. A standalone, app-chrome-free HTML
// document of the SAME shared template (client-branded), that auto-opens the
// browser's print dialog -> Save as PDF. No headless browser, no separate
// layout: the PDF is literally the shared HTML, so it cannot drift from the
// in-app view or the email copy.
export async function GET(req: NextRequest) {
  if (!vaultConfigured()) {
    return new NextResponse("Vault not configured.", { status: 503 });
  }
  const sp = req.nextUrl.searchParams;
  const path = sp.get("note") ?? undefined;
  const seriesPath = sp.get("series") ?? undefined;

  const result = await buildShareHtml({ path, seriesPath }, { expandClosed: true });
  if (!result) {
    return new NextResponse("Provide a valid `note` or `series` path.", { status: 400 });
  }

  const title = escapeHtml(result.filename || "meeting-notes");
  const doc =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title}</title><style>` +
    `@page { size: auto; margin: 14mm; }` +
    `html,body { margin:0; padding:0; }` +
    `*{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }` +
    `@media screen { body { background:#eef0f3; padding:24px; } }` +
    `</style></head><body>${result.html}` +
    `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});</script>` +
    `</body></html>`;

  return new NextResponse(doc, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
