import { NextResponse, type NextRequest } from "next/server";
import {
  documentsEnabled,
  uploadDocument,
  listDocuments,
  deleteDocument,
  isDocType,
} from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// List documents (optionally by account).
export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get("account") ?? undefined;
  const docs = await listDocuments(account || undefined).catch(() => []);
  return NextResponse.json({ ok: true, documents: docs, enabled: documentsEnabled() });
}

// Upload a document: file + metadata (multipart form).
export async function POST(req: NextRequest) {
  if (!documentsEnabled()) {
    return NextResponse.json(
      { error: "Document library is not configured (needs POSTGRES_URL and BLOB_READ_WRITE_TOKEN)." },
      { status: 503 },
    );
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  const docTypeRaw = String(form.get("docType") ?? "other");
  const docType = isDocType(docTypeRaw) ? docTypeRaw : "other";

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await uploadDocument({
      bytes,
      fileName: file.name,
      contentType: file.type || undefined,
      title: String(form.get("title") ?? "") || undefined,
      docType,
      account: String(form.get("account") ?? "") || undefined,
      notes: String(form.get("notes") ?? "") || undefined,
    });
    return NextResponse.json({ ok: true, document: doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Delete a document by id (?id=).
export async function DELETE(req: NextRequest) {
  if (!documentsEnabled()) {
    return NextResponse.json({ error: "Document library is not configured." }, { status: 503 });
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A valid document id is required." }, { status: 400 });
  }
  try {
    await deleteDocument(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
