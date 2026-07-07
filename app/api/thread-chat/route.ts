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

const MAX_CONTEXT_THREADS = 4;

// The inbox brain: a persistent chat over one OR MORE email threads. The
// client sends the running history, the thread keys added as context, and the
// currently-open thread; the model sees them all, labeled. Display-only:
// nothing is stored or sent; Jordan inserts drafts into the composer himself.
// body: { history: [{role, content}], contextKeys?: string[], activeThreadKey?: string }
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
  const activeKey =
    typeof body?.activeThreadKey === "string" && body.activeThreadKey
      ? body.activeThreadKey
      : null;
  const contextKeys: string[] = Array.isArray(body?.contextKeys)
    ? body.contextKeys.filter((k: unknown): k is string => typeof k === "string" && !!k)
    : [];
  if (!history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "A history ending with a user message is required." },
      { status: 400 },
    );
  }

  // Active thread first, then added context, capped.
  const keys = Array.from(new Set([activeKey, ...contextKeys].filter((k): k is string => !!k)))
    .slice(0, MAX_CONTEXT_THREADS);
  if (!keys.length) {
    return NextResponse.json(
      { error: "Open a thread (or add one to context) so the brain has something to read." },
      { status: 400 },
    );
  }

  try {
    const participants = new Map<string, string>();
    const sections: string[] = [];
    let firstSubject = "";
    for (const key of keys) {
      const { subject, messages } = await getThread(key).catch(() => ({
        subject: "",
        messages: [],
      }));
      if (!messages.length) continue;
      if (!firstSubject) firstSubject = subject;
      for (const m of messages) {
        if (m.fromEmail) {
          participants.set(
            m.fromEmail.toLowerCase(),
            m.fromName?.trim() || m.fromEmail,
          );
        }
        for (const r of m.recipients ?? []) {
          if (r?.email) participants.set(r.email.toLowerCase(), r.name?.trim() || r.email);
        }
      }
      const text = [...messages]
        .reverse()
        .map((m) => {
          const at = (m.sentAt ?? m.receivedAt)?.toISOString().slice(0, 16) ?? "";
          const who = m.fromName?.trim() || m.fromEmail || "unknown";
          return `[${m.direction === "outbound" ? "JORDAN" : who} ${at}]\n${formatEmailBody(m).main}`;
        })
        .join("\n\n---\n\n")
        .slice(0, 9000);
      const label =
        key === activeKey ? "CURRENTLY OPEN THREAD" : "CONTEXT THREAD";
      sections.push(`=== ${label}: "${subject}" ===\n${text}`);
    }
    if (!sections.length) {
      return NextResponse.json({ error: "No readable threads." }, { status: 404 });
    }

    const participantLines = [...participants]
      .map(([email, name]) => `${name} <${email}> [${isInternal(email) ? "Merit" : "External"}]`)
      .join("\n");

    const voice = voiceInstructions(await getVoiceProfile().catch(() => null));
    const result = await threadChat({
      subject: firstSubject || "Inbox",
      threadText: sections.join("\n\n\n"),
      participants: participantLines,
      history,
      voice,
    });
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
