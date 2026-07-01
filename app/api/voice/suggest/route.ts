import { NextResponse } from "next/server";
import { desc, eq, and, isNotNull } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails } from "@/lib/db/schema";
import { proposeVoiceProfile, aiConfigured } from "@/lib/ai";
import { ensureFirehoseSchema } from "@/lib/firehose/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Propose a voice profile from Jordan's real sent emails. Does NOT save; the
// settings page shows the proposal for him to edit and then save.
export async function POST() {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI unavailable (ANTHROPIC_API_KEY unset)." },
      { status: 503 },
    );
  }
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  await ensureFirehoseSchema();

  let rows: { bodyText: string | null; bodyPreview: string | null }[] = [];
  try {
    rows = await getDb()
      .select({ bodyText: emails.bodyText, bodyPreview: emails.bodyPreview })
      .from(emails)
      .where(and(eq(emails.direction, "outbound"), isNotNull(emails.bodyText)))
      .orderBy(desc(emails.sentAt))
      .limit(15);
  } catch {
    rows = [];
  }

  const samples = rows
    .map((r) => (r.bodyText ?? r.bodyPreview ?? "").trim())
    .filter((s) => s.length > 40)
    .slice(0, 12);

  if (samples.length < 2) {
    return NextResponse.json(
      {
        error:
          "Not enough sent mail captured yet to infer your voice. Send a few emails (they flow in via HC Capture Sent), then try again, or fill it in manually.",
      },
      { status: 422 },
    );
  }

  try {
    const profile = await proposeVoiceProfile(samples);
    return NextResponse.json({ ok: true, profile, sampleCount: samples.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not analyze your voice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
