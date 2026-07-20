import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { cutoverActive } from "@/lib/dbSource";
import { listAccounts } from "@/lib/accounts";
import { dbUpdateTaskField } from "@/lib/tasksDb";
import { validateTaskUpdate, TaskUpdateError } from "@/lib/taskUpdate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inline edit from /tasks (dev-feedback #8): update one field (account, type,
// status, due) on a task row directly in the DB. No vault write, ever, the
// export renders the current DB state into markdown when Jordan runs it.
// body: { sourceFile, sourceLine, field, value }
export async function POST(req: NextRequest) {
  if (!dbConfigured() || !(await cutoverActive())) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const sourceFile = typeof body?.sourceFile === "string" ? body.sourceFile : "";
  const sourceLine = Number(body?.sourceLine);
  if (!sourceFile || !Number.isInteger(sourceLine) || sourceLine < 0) {
    return NextResponse.json(
      { error: "sourceFile and sourceLine are required." },
      { status: 400 },
    );
  }

  try {
    const accounts = await listAccounts();
    const validated = validateTaskUpdate(
      { field: body?.field, value: body?.value },
      accounts.map((a) => a.name),
    );
    await dbUpdateTaskField({ sourceFile, sourceLine, ...validated });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TaskUpdateError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
