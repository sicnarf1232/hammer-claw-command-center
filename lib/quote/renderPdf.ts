import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { buildQuoteHtml } from "@/lib/quote/quoteHtml";
import type { QuoteSpec } from "@/lib/quote/types";

// Render a QuoteSpec to a PDF via headless Chromium from the same HTML the
// preview uses. Shared by the download route (/api/quote/pdf) and the
// save-to-account route (/api/quote/save) so the binary cannot drift.
// Note: both routes that import this must be listed in next.config.mjs
// outputFileTracingIncludes so the Chromium binary ships with the function.
export async function renderQuotePdf(spec: QuoteSpec): Promise<Uint8Array> {
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
    return new Uint8Array(pdf);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
