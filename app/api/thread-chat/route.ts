import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { aiConfigured, threadChat, AiNotConfiguredError } from "@/lib/ai";
import { getThread } from "@/lib/firehose/read";
import { isInternal } from "@/lib/firehose/map";
import { formatEmailBody } from "@/lib/emailFormat";
import { getVoiceProfile, voiceInstructions } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Conversational brain over one email thread (inbox focus mode). Display-only:
// nothing is stored or sent; Jordan inserts a draft into the composer himself.
// body: { threadKey, history: [{role:"user"|"assistant", content}] }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI unavailable (ANTHROPIC_API_KEY unset)." },
      { status: 503 },
    );
  }
  const body = await req.json().catch(() => null);
  const threadKey = String(body?.threadKey ?? "");
  const history = Array.isArray(body?.history)
    ? body.history
        .filter(
          (m: { role?: string; content?: string }) =>
            (m?.role === "user" || m?.role === "assistant") &&
            typeof m?.content === "string" &&
            m.content.trim(),
        )
        .map((m: { role: "user" | "assistant"; content: string }) => ({
          role: m.role,
          content: m.content,
        }))
    : [];
  if (!threadKey || !history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "threadKey and a history ending with a user message are required." },
      { status: 400 },
    );
  }

  try {
    const { subject, messages } = await getThread(threadKey);
    if (!messages.length) {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }
    const seen = new Map<string, string>();
    for (const m of messages) {
      if (m.fromEmail) seen.set(m.fromEmail.toLowerCase(), m.fromName?.trim() || m.fromEmail);
      for (const r of m.recipients ?? []) {
        if (r?.email) seen.set(r.email.toLowerCase(), r.name?.trim() || r.email);
      }
    }
    const participants = [...seen]
      .map(([email, name]) => `${name} <${email}> [${isInternal(email) ? "Merit" : "External"}]`)
      .join("\n");
    const threadText = [...messages]
      .reverse()
      .map((m) => {
        const at = (m.sentAt ?? m.receivedAt)?.toISOString().slice(0, 16) ?? "";
        const who = m.fromName?.trim() || m.fromEmail || "unknown";
        return `[${m.direction === "outbound" ? "JORDAN" : who} ${at}]\n${formatEmailBody(m).main}`;
      })
      .join("\n\n---\n\n");

    const voice = voiceInstructions(await getVoiceProfile().catch(() => null));
    const result = await threadChat({ subject, threadText, participants, history, voice });
    return NextResponse.json({ ok: true, text: result.text, model: result.modelUsed });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed." },
      { status: 500 },
    );
  }
}
