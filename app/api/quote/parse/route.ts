import { NextResponse, type NextRequest } from "next/server";
import { parseStructuredQuote } from "@/lib/quote/parseStructured";
import { normalizeQuote } from "@/lib/quote/normalize";
import { validateQuote } from "@/lib/quote/validate";
import { aiConfigured, parseQuoteFreeform } from "@/lib/ai";
import type { RawQuoteInput } from "@/lib/quote/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Parse a prompt-filler input into a normalized QuoteSpec. mode "structured"
// uses the deterministic key-value parser; "freeform" uses the LLM; "auto"
// tries structured first and falls back to the LLM when no items are found.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { text?: string; mode?: "structured" | "freeform" | "auto" }
    | null;
  const text = (body?.text ?? "").trim();
  const mode = body?.mode ?? "auto";
  if (!text) {
    return NextResponse.json({ error: "No text provided." }, { status: 400 });
  }

  let raw: RawQuoteInput;
  try {
    if (mode === "freeform") {
      raw = await runFreeform(text);
    } else {
      raw = parseStructuredQuote(text);
      const empty = !raw.lineItems || raw.lineItems.length === 0;
      if (empty && mode === "auto") {
        raw = await runFreeform(text);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not parse the input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const spec = normalizeQuote(raw);
  const validation = validateQuote(spec);
  return NextResponse.json({ spec, validation });
}

async function runFreeform(text: string): Promise<RawQuoteInput> {
  if (!aiConfigured()) {
    throw new Error(
      "Free-form parsing needs ANTHROPIC_API_KEY. Use the structured 'Line Item N' format instead.",
    );
  }
  return parseQuoteFreeform(text);
}
