import { NextResponse, type NextRequest } from "next/server";
import { getVoiceProfile, saveVoiceProfile, EMPTY_VOICE, type VoiceProfile } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const profile = (await getVoiceProfile()) ?? EMPTY_VOICE;
  return NextResponse.json({ ok: true, profile });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [];
  const oneOf = <T extends string>(v: unknown, opts: T[], dflt: T): T =>
    opts.includes(v as T) ? (v as T) : dflt;

  const profile: VoiceProfile = {
    greeting: str(b.greeting),
    signoff: str(b.signoff),
    formality: oneOf(b.formality, ["casual", "balanced", "formal"], "balanced"),
    length: oneOf(b.length, ["brief", "balanced", "thorough"], "balanced"),
    traits: list(b.traits),
    usePhrases: list(b.usePhrases),
    avoidPhrases: list(b.avoidPhrases),
    summary: str(b.summary),
  };
  try {
    await saveVoiceProfile(profile);
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
