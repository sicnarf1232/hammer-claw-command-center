import { NextResponse, type NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { blobConfigured } from "@/lib/documents";
import { validateAttachment } from "@/lib/brainAttachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Brain chat attachment upload (dev-feedback #6): one file per request, stored
// as a PRIVATE blob (never publicly reachable; only the server reads it back
// when building the model call). Behind the APP_PASSWORD middleware like every
// other /api route. Returns the metadata ref the client keeps in history.
export async function POST(req: NextRequest) {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: "File uploads are not configured (needs BLOB_READ_WRITE_TOKEN)." },
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

  const check = validateAttachment({ name: file.name, type: file.type, size: file.size });
  if (!check.ok || !check.kind) {
    return NextResponse.json({ error: check.error ?? "Unsupported file." }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    // Belt and braces: the File.size the browser reported already passed, but
    // the bytes are what we store, so gate on them too (same 8 MB cap).
    const sizeCheck = validateAttachment({ name: file.name, type: file.type, size: bytes.byteLength });
    if (!sizeCheck.ok) {
      return NextResponse.json({ error: sizeCheck.error }, { status: 400 });
    }
    const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const blob = await put(`brain-attachments/${Date.now()}-${safe}`, bytes, {
      access: "private",
      contentType: file.type || undefined,
      addRandomSuffix: true,
    });
    return NextResponse.json({
      ok: true,
      attachment: {
        name: file.name,
        url: blob.url,
        mime: file.type || "",
        size: bytes.byteLength,
        kind: check.kind,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
