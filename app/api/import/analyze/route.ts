import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";
import { aiConfigured, proposeImportMapping } from "@/lib/ai";
import { uploadDocument } from "@/lib/documents";
import { ensurePricingSchema } from "@/lib/pricing/schema";
import { parseSpreadsheet, headerSignature } from "@/lib/importer/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

// Step 1 of the price import: upload + parse + find-or-propose a mapping.
// NOTHING is written to agreements here; the file is stored in the document
// library (raw source material, not model output) and the mapping goes back
// to Jordan for confirmation.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a CSV or XLSX file." }, { status: 400 });
  }
  try {
    await ensurePricingSchema();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sheet = parseSpreadsheet(bytes);
    if (!sheet.headers.length || !sheet.rows.length) {
      return NextResponse.json(
        { error: "Could not read any rows from that file." },
        { status: 422 },
      );
    }
    const doc = await uploadDocument({
      title: `Price import ${file.name}`,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      bytes,
      docType: "other",
      notes: "price-import source",
    });

    const signature = headerSignature(sheet.headers);
    const res = await getDb().execute(
      sql`select id, name, mapping from import_rulesets where header_signature = ${signature} limit 1`,
    );
    const ruleset = rowsOf(res)[0] ?? null;

    let proposal = null;
    if (!ruleset && aiConfigured()) {
      proposal = await proposeImportMapping(sheet.headers, sheet.rows.slice(0, 5));
    }

    return NextResponse.json({
      ok: true,
      documentId: doc.id,
      fileName: file.name,
      headers: sheet.headers,
      rowCount: sheet.rows.length,
      preview: sheet.rows.slice(0, 5),
      signature,
      ruleset: ruleset
        ? { id: Number(ruleset.id), name: String(ruleset.name), mapping: ruleset.mapping }
        : null,
      proposal,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analyze failed." },
      { status: 500 },
    );
  }
}
