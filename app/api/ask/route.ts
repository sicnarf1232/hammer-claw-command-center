import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { aiConfigured, answerVaultQuestion, type BrainTurn } from "@/lib/ai";
import { assembleBrainContext } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Milestone 2 #5: answer a question grounded in the live vault.
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI is not configured (ANTHROPIC_API_KEY unset)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  const history: BrainTurn[] = Array.isArray(body?.history)
    ? body.history
        .filter(
          (t: unknown): t is BrainTurn =>
            !!t &&
            typeof t === "object" &&
            (((t as BrainTurn).role === "user") || ((t as BrainTurn).role === "assistant")) &&
            typeof (t as BrainTurn).content === "string",
        )
        .slice(-6)
    : [];

  try {
    const { context, sources } = await assembleBrainContext(question);
    const answer = await answerVaultQuestion({ question, context, history });
    return NextResponse.json({ ok: true, answer, sources });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ask failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
