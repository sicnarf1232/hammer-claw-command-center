import { NextResponse, type NextRequest } from "next/server";
import { normalizeQuote } from "@/lib/quote/normalize";
import { validateQuote } from "@/lib/quote/validate";
import { renderQuotePdf } from "@/lib/quote/renderPdf";
import {
  deleteDocument,
  documentsEnabled,
  findDocument,
  uploadDocument,
} from "@/lib/documents";
import type { RawQuoteInput } from "@/lib/quote/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Save a generated quote to the document library, linked to its account, so it
// shows on the account's Quotes tab. Renders the same PDF as the download.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | (RawQuoteInput & { quoteId?: string })
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!documentsEnabled()) {
    return NextResponse.json(
      {
        error:
          "Saving needs the document library: set POSTGRES_URL and BLOB_READ_WRITE_TOKEN in Vercel. You can still Download the PDF.",
      },
      { status: 503 },
    );
  }

  const spec = normalizeQuote(body);
  if (typeof body.quoteId === "string" && body.quoteId.trim()) {
    spec.quoteId = body.quoteId.trim();
  }
  if (!spec.customerName.trim()) {
    return NextResponse.json(
      { error: "A customer / account is required to save and link the quote." },
      { status: 400 },
    );
  }

  const { errors } = validateQuote(spec);
  if (errors.length > 0) {
    return NextResponse.json(
      { error: "Quote is incomplete.", details: errors },
      { status: 400 },
    );
  }

  try {
    const pdf = await renderQuotePdf(spec);
    const title = spec.quoteId || "Quote";
    const fileName = `${safeName(spec.quoteId || "quote")}.pdf`;

    // Overwrite an existing quote with the same id for this account (re-edit /
    // revision): drop the old blob + row before saving the new version.
    const existing = await findDocument(spec.customerName, title, "quote");
    if (existing) await deleteDocument(existing.id).catch(() => {});

    const doc = await uploadDocument({
      bytes: new Uint8Array(pdf),
      fileName,
      contentType: "application/pdf",
      title,
      docType: "quote",
      account: spec.customerName,
      notes: spec.description || undefined,
      spec,
    });
    return NextResponse.json({ ok: true, document: doc, replaced: Boolean(existing) });
  } catch (err) {
    console.error("[quote/save] failed:", err);
    const message = err instanceof Error ? err.message : "Save failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9 _.-]/g, " ").replace(/\s+/g, " ").trim() || "quote";
}
