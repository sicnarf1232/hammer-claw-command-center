import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { confirmTaskEmailLinks } from "@/lib/taskEmailLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Confirm a task<->email link (dev-feedback #11). Only ever called after
// Jordan acts, from the thread view ("this email may complete...") or the
// tasks page. Never automatic: this is the one write path into task_emails
// for suggested matches, and every row it writes is stamped confirmed_by.
// body: { sourceFile, sourceLine, emailIds: number[], aiGenerated? }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const sourceFile = typeof body?.sourceFile === "string" ? body.sourceFile : "";
  const sourceLine = Number(body?.sourceLine);
  const emailIds = Array.isArray(body?.emailIds)
    ? body.emailIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n))
    : [];
  if (!sourceFile || !Number.isInteger(sourceLine) || sourceLine < 0) {
    return NextResponse.json(
      { error: "sourceFile and sourceLine are required." },
      { status: 400 },
    );
  }
  if (!emailIds.length) {
    return NextResponse.json({ error: "At least one emailId is required." }, { status: 400 });
  }

  try {
    const result = await confirmTaskEmailLinks({
      sourceFile,
      sourceLine,
      emailIds,
      aiGenerated: body?.aiGenerated === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Link failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
