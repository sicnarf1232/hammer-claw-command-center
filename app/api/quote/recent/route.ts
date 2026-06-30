import { NextResponse } from "next/server";
import { documentsEnabled, listDocuments } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recent saved quotes (across accounts), newest first, with their spec so the
// builder can re-open one for editing. Lightweight projection for the panel.
export async function GET() {
  if (!documentsEnabled()) {
    return NextResponse.json({ ok: true, quotes: [], enabled: false });
  }
  const docs = (await listDocuments().catch(() => [])).filter(
    (d) => d.docType === "quote",
  );
  const quotes = docs.map((d) => ({
    id: d.id,
    title: d.title,
    account: d.account,
    uploadedAt: d.uploadedAt,
    hasSpec: d.spec != null,
    spec: d.spec ?? null,
  }));
  return NextResponse.json({ ok: true, quotes, enabled: true });
}
