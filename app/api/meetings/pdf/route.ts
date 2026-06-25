import { type NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { vaultConfigured } from "@/lib/vault";
import { buildShareHtml } from "@/lib/meetingExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 3 step 2 (revised): a real, auto-downloading PDF rendered from the SAME
// shared HTML via headless Chromium. No print dialog. The PDF cannot drift from
// the in-app view or the email copy because it is the same template HTML.
export async function GET(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const sp = req.nextUrl.searchParams;
  const path = sp.get("note") ?? undefined;
  const seriesPath = sp.get("series") ?? undefined;

  let result: { html: string; filename: string } | null;
  try {
    result = await buildShareHtml({ path, seriesPath }, { expandClosed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to render the note.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!result) {
    return NextResponse.json(
      { error: "Provide a valid `note` or `series` path." },
      { status: 400 },
    );
  }

  const doc =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>` +
    `@page { size: Letter; margin: 14mm; }` +
    `html,body { margin:0; padding:0; }` +
    `*{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }` +
    `</style></head><body>${result.html}</body></html>`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const executablePath = process.env.CHROME_PATH || (await chromium.executablePath());
    console.log("[meetings/pdf] launching chromium", { executablePath, args: chromium.args.length });
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 820, height: 1160, deviceScaleFactor: 2 },
      // Local dev: set CHROME_PATH to a real Chrome (the bundled binary is Linux).
      executablePath,
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(doc, { waitUntil: "load", timeout: 20000 });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
    });
    const filename = safeName(result.filename);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[meetings/pdf] generation failed:", err);
    const message = err instanceof Error ? err.message : "PDF generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9 _.-]/g, " ").replace(/\s+/g, " ").trim() || "meeting-notes";
}
