import { NextResponse, type NextRequest } from "next/server";
import {
  vaultConfigured,
  getMeetingNoteByPath,
  getSeriesByPath,
} from "@/lib/vault";
import { meetingToShareDoc, seriesToShareDoc } from "@/lib/meetingShare";
import { buildMeetingPdf } from "@/lib/meetingPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase D: a branded Film Room PDF of a meeting note or a rolling series.
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const seriesPath = typeof body?.seriesPath === "string" ? body.seriesPath : "";

  try {
    const doc = seriesPath
      ? await (async () => {
          const s = await getSeriesByPath(seriesPath);
          return s ? seriesToShareDoc(s) : null;
        })()
      : path
        ? await (async () => {
            const n = await getMeetingNoteByPath(path);
            return n ? meetingToShareDoc(n) : null;
          })()
        : null;

    if (!doc) {
      return NextResponse.json(
        { error: "Provide a valid meeting `path` or `seriesPath`." },
        { status: 400 },
      );
    }

    const pdf = await buildMeetingPdf(doc);
    const filename = `${safeName(doc.filenameBase)}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9 _.-]/g, " ").replace(/\s+/g, " ").trim() || "film-room";
}
