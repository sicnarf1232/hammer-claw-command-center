import { NextResponse, type NextRequest } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { normalizeQuote } from "@/lib/quote/normalize";
import { validateQuote } from "@/lib/quote/validate";
import { buildQuoteHtml } from "@/lib/quote/quoteHtml";
import type { RawQuoteInput } from "@/lib/quote/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Render the redesigned Merit OEM quotation to a real, auto-downloading PDF via
// headless Chromium from the same HTML the preview uses. House style applies in
// the generated content (no em dashes).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | (RawQuoteInput & { quoteId?: string })
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const spec = normalizeQuote(body);
  if (typeof body.quoteId === "string" && body.quoteId.trim()) {
    spec.quoteId = body.quoteId.trim();
  }

  const { errors } = validateQuote(spec);
  if (errors.length > 0) {
    return NextResponse.json(
      { error: "Quote is incomplete.", details: errors },
      { status: 400 },
    );
  }

  const doc = buildQuoteHtml(spec, { screen: false });

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const executablePath =
      process.env.CHROME_PATH || (await chromium.executablePath());
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 816, height: 1056, deviceScaleFactor: 2 },
      executablePath,
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(doc, { waitUntil: "load", timeout: 25000 });
    await page.evaluateHandle("document.fonts.ready");
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    const filename = safeName(spec.quoteId || "quote");
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[quote/pdf] generation failed:", err);
    const message = err instanceof Error ? err.message : "PDF generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9 _.-]/g, " ").replace(/\s+/g, " ").trim() || "quote";
}
