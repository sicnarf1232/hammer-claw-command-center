import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { completeTask, WriteBackError } from "@/lib/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mark a task done (or reopen it) in its vault source file via a commit.
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const sourceFile = typeof body?.sourceFile === "string" ? body.sourceFile : "";
  const sourceLine = Number(body?.sourceLine);
  const done = body?.done === false ? false : true;
  if (!sourceFile || !Number.isInteger(sourceLine) || sourceLine < 0) {
    return NextResponse.json(
      { error: "sourceFile and sourceLine are required." },
      { status: 400 },
    );
  }
  try {
    const res = await completeTask(sourceFile, sourceLine, done);
    return NextResponse.json({ ok: true, commit: res.commitSha });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
