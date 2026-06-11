import { NextResponse, type NextRequest } from "next/server";
import { buildQuotePdf, type QuoteLineItem } from "@/lib/quotePdf";
import { todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return NextResponse.json(
      { error: "At least one line item is required." },
      { status: 400 },
    );
  }

  const lineItems: QuoteLineItem[] = body.lineItems.map((it: Record<string, unknown>) => ({
    partNumber: String(it.partNumber ?? ""),
    description: String(it.description ?? ""),
    qty: Number(it.qty ?? 0) || 0,
    unitCost: Number(it.unitCost ?? 0) || 0,
  }));

  const pdf = await buildQuotePdf({
    title: String(body.title ?? "Quote"),
    customer: String(body.customer ?? ""),
    notes: String(body.notes ?? ""),
    lineItems,
    dateISO: todayISO(),
  });

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="quote.pdf"`,
    },
  });
}
