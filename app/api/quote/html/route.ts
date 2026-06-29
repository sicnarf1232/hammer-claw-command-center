import { NextResponse, type NextRequest } from "next/server";
import { normalizeQuote } from "@/lib/quote/normalize";
import { buildQuoteHtml } from "@/lib/quote/quoteHtml";
import type { RawQuoteInput } from "@/lib/quote/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live preview: the same document HTML the PDF route prints, in on-screen mode
// (backdrop + page shadows) for an iframe. Renders even when incomplete so the
// builder shows work in progress; the PDF route enforces validation.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | (RawQuoteInput & { quoteId?: string })
    | null;
  if (!body) {
    return new NextResponse("Invalid request body.", { status: 400 });
  }

  const spec = normalizeQuote(body);
  if (typeof body.quoteId === "string" && body.quoteId.trim()) {
    spec.quoteId = body.quoteId.trim();
  }

  const html = buildQuoteHtml(spec, { screen: true });
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
