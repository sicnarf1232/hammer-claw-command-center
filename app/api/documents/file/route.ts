import { NextResponse, type NextRequest } from "next/server";
import { documentsEnabled, getDocument, openDocumentBlob } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream a private document blob back to the authed user (the app sits behind
// APP_PASSWORD middleware). Private blobs are not publicly accessible, so the
// library links here instead of at the raw blob URL.
export async function GET(req: NextRequest) {
  if (!documentsEnabled()) {
    return NextResponse.json(
      { error: "Document library is not configured." },
      { status: 503 },
    );
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A valid document id is required." }, { status: 400 });
  }
  const doc = await getDocument(id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    const res = await openDocumentBlob(doc.blobUrl);
    if (!res || res.statusCode !== 200) {
      return NextResponse.json({ error: "Could not read the file." }, { status: 502 });
    }
    const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
    return new NextResponse(res.stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": doc.contentType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${safeName(doc.fileName)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("[documents/file] stream failed:", err);
    return NextResponse.json({ error: "Could not read the file." }, { status: 500 });
  }
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9 _.-]/g, "_").trim() || "document";
}
