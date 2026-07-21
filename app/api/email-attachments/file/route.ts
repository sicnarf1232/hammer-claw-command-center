import { NextResponse, type NextRequest } from "next/server";
import { getAttachment, openAttachmentBlob } from "@/lib/firehose/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream a private email attachment to the authed user (the app sits behind the
// APP_PASSWORD middleware). Private blobs are not publicly reachable, so the
// thread view links here. PDFs/images render inline; everything else downloads.
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A valid attachment id is required." }, { status: 400 });
  }
  const att = await getAttachment(id);
  if (!att) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }
  if (!att.blobUrl) {
    return NextResponse.json(
      { error: "This attachment was not retained (no Blob store, or too large)." },
      { status: 404 },
    );
  }

  try {
    const res = await openAttachmentBlob(att.blobUrl);
    if (!res || res.statusCode !== 200) {
      return NextResponse.json({ error: "Could not read the file." }, { status: 502 });
    }
    const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
    // Content-Length when known: a stream with no declared length makes some
    // download managers (Safari especially) treat the save as indeterminate
    // and occasionally mishandle it. filename* carries the exact original
    // name (RFC 5987) alongside the ASCII-safe fallback.
    const name = safeName(att.fileName);
    const headers: Record<string, string> = {
      "Content-Type": att.contentType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(att.fileName ?? name)}`,
      "Cache-Control": "private, max-age=60",
    };
    if (att.sizeBytes && att.sizeBytes > 0) headers["Content-Length"] = String(att.sizeBytes);
    return new NextResponse(res.stream as unknown as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[email-attachments/file] stream failed:", err);
    return NextResponse.json({ error: "Could not read the file." }, { status: 500 });
  }
}

function safeName(s: string | null): string {
  return (s ?? "attachment").replace(/[^A-Za-z0-9 _.-]/g, "_").trim() || "attachment";
}
