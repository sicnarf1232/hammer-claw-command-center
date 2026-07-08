import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { AGENTS, type AgentKey } from "@/lib/agents/registry";
import { setAgentSetting } from "@/lib/agents/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_CHOICES = ["default", "smart", "fast", "ab"];

// Per-agent knobs from /agents: enable/disable and model choice. Model is
// always one of the two configured runtime models (or the A/B alternation
// between them); arbitrary model ids are not accepted.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const agent = String(body?.agent ?? "");
  if (!AGENTS.some((a) => a.key === agent)) {
    return NextResponse.json({ error: "Unknown agent." }, { status: 400 });
  }
  const patch: { enabled?: boolean; modelChoice?: "default" | "smart" | "fast" | "ab" } = {};
  if (typeof body?.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body?.modelChoice === "string") {
    if (!MODEL_CHOICES.includes(body.modelChoice)) {
      return NextResponse.json({ error: "Unknown model choice." }, { status: 400 });
    }
    patch.modelChoice = body.modelChoice;
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  try {
    await setAgentSetting(agent as AgentKey, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status: 500 },
    );
  }
}
