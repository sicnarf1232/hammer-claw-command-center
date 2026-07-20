import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { dbConfigured, getDb, tasks as tasksT } from "@/lib/db";
import { linkedEmailsForTask, suggestEmailsForTask, DB_TASK_FILE } from "@/lib/taskEmailLinks";
import type { MatchableTask } from "@/lib/taskEmailMatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasks-page read for dev-feedback #11: confirmed linked emails ("Linked
// emails (N)") plus a short list of recent inbound emails that might
// complete this task, so the suggestion is visible in the tasks context too,
// not just the inbox. GET ?sourceFile=&sourceLine=
export async function GET(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const sourceFile = req.nextUrl.searchParams.get("sourceFile")?.trim() ?? "";
  const sourceLine = Number(req.nextUrl.searchParams.get("sourceLine"));
  if (!sourceFile || !Number.isInteger(sourceLine) || sourceLine < 0) {
    return NextResponse.json(
      { error: "sourceFile and sourceLine query params are required." },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const row =
      sourceFile === DB_TASK_FILE
        ? (await db.select().from(tasksT).where(eq(tasksT.id, sourceLine)).limit(1))[0]
        : (
            await db
              .select()
              .from(tasksT)
              .where(and(eq(tasksT.sourcePath, sourceFile), eq(tasksT.sourceLine, sourceLine)))
              .limit(1)
          )[0];

    const linked = await linkedEmailsForTask(sourceFile, sourceLine);

    let suggested: Awaited<ReturnType<typeof suggestEmailsForTask>> = [];
    if (row) {
      const task: MatchableTask = {
        id: `${sourceFile}:${sourceLine}`,
        title: row.text,
        description: row.description,
        notes: row.notes,
        customer: row.customer,
      };
      suggested = await suggestEmailsForTask(task, sourceFile, sourceLine, row.accountId ?? null, 3);
    }

    return NextResponse.json({ ok: true, linked, suggested });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
