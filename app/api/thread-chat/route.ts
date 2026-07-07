import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";
import { aiConfigured, runInboxAgent, AiNotConfiguredError } from "@/lib/ai";
import { getThread } from "@/lib/firehose/read";
import { isInternal } from "@/lib/firehose/map";
import { formatEmailBody } from "@/lib/emailFormat";
import { getVoiceProfile, voiceInstructions } from "@/lib/voice";
import { assembleBrainContext } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CONTEXT_THREADS = 4;

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

async function formatThread(key: string, label: string): Promise<string | null> {
  const { subject, messages } = await getThread(key).catch(() => ({
    subject: "",
    messages: [],
  }));
  if (!messages.length) return null;
  const text = [...messages]
    .reverse()
    .map((m) => {
      const at = (m.sentAt ?? m.receivedAt)?.toISOString().slice(0, 16) ?? "";
      const who = m.fromName?.trim() || m.fromEmail || "unknown";
      return `[${m.direction === "outbound" ? "JORDAN" : who} ${at}]\n${formatEmailBody(m).main}`;
    })
    .join("\n\n---\n\n")
    .slice(0, 9000);
  return `=== ${label}: "${subject}" (key: ${key}) ===\n${text}`;
}

// Search the WHOLE inbox by keywords; returns thread hits for the agent.
async function searchInbox(query: string): Promise<string> {
  const q = `%${query.trim().replace(/\s+/g, "%")}%`;
  const res = await getDb().execute(sql`
    select id, thread_id, subject, from_name, from_email,
           coalesce(sent_at, received_at) as at, body_text
    from emails
    where subject ilike ${q} or body_text ilike ${q}
       or from_name ilike ${q} or from_email ilike ${q}
    order by coalesce(sent_at, received_at) desc nulls last
    limit 40
  `);
  const seen = new Set<string>();
  const hits: string[] = [];
  for (const r of rowsOf(res)) {
    const key = r.thread_id ? `t:${r.thread_id}` : `m:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const body = String(r.body_text ?? "");
    const idx = body.toLowerCase().indexOf(query.trim().split(/\s+/)[0]?.toLowerCase() ?? "");
    const snippet = body.slice(Math.max(0, idx - 60), idx + 140).replace(/\s+/g, " ").trim();
    const at = r.at ? String(r.at).slice(0, 10) : "";
    hits.push(
      `key: ${key} | ${at} | from ${r.from_name ?? r.from_email ?? "?"} | "${r.subject ?? "(no subject)"}"${snippet ? ` | …${snippet}…` : ""}`,
    );
    if (hits.length >= 8) break;
  }
  return hits.length
    ? `Matching threads (use read_thread with a key for the full text):\n${hits.join("\n")}`
    : "No matching emails found.";
}

// The inbox brain: a persistent, TOOL-USING chat over the whole inbox. It can
// search all mail, read any thread, and query the vault brain, then answer or
// draft. Display-only: nothing is stored or sent by the model.
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
  if (!history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "A history ending with a user message is required." },
      { status: 400 },
    );
  }
  const activeKey =
    typeof body?.activeThreadKey === "string" && body.activeThreadKey
      ? body.activeThreadKey
      : null;
  const contextKeys: string[] = Array.isArray(body?.contextKeys)
    ? body.contextKeys.filter((k: unknown): k is string => typeof k === "string" && !!k)
    : [];
  const keys = Array.from(
    new Set([activeKey, ...contextKeys].filter((k): k is string => !!k)),
  ).slice(0, MAX_CONTEXT_THREADS);

  try {
    // Pre-load the open + pinned threads into the system prompt; everything
    // else is reachable through the tools.
    const sections: string[] = [];
    const participants = new Map<string, string>();
    for (const key of keys) {
      const section = await formatThread(
        key,
        key === activeKey ? "CURRENTLY OPEN THREAD" : "CONTEXT THREAD",
      );
      if (section) sections.push(section);
      const { messages } = await getThread(key).catch(() => ({ messages: [] }));
      for (const m of messages) {
        if (m.fromEmail) participants.set(m.fromEmail.toLowerCase(), m.fromName?.trim() || m.fromEmail);
        for (const r of m.recipients ?? []) {
          if (r?.email) participants.set(r.email.toLowerCase(), r.name?.trim() || r.email);
        }
      }
    }
    const participantLines = [...participants]
      .map(([email, name]) => `${name} <${email}> [${isInternal(email) ? "Merit" : "External"}]`)
      .join("\n");
    const voice = voiceInstructions(await getVoiceProfile().catch(() => null));

    const system = [
      "You are Jordan Francis's inbox assistant inside his command center (like Claude in Outlook).",
      "You can: answer questions about ANY email (search_inbox then read_thread), pull facts from his knowledge base (search_brain: accounts, tasks, meetings, pricing, documents), summarize, extract asks, and DRAFT replies or new messages on request.",
      "Search before saying you cannot find something. Ground every claim in what you read; cite which thread or source a fact came from. Never invent facts, prices, dates, or commitments.",
      "When drafting: write the full body in Jordan's voice, ready to send, plain text, short paragraphs, addressed to whoever he named (default: the latest customer sender of the open thread).",
      voice ? `Jordan's voice profile: ${voice}` : "",
      "House style: never use em dashes (use commas, colons, or periods).",
      participantLines ? `\nParticipants on the loaded threads:\n${participantLines}` : "",
      sections.length ? `\n${sections.join("\n\n\n")}` : "\n(No thread is open; use search_inbox to find mail.)",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await runInboxAgent({
      system,
      history,
      executeTool: async (name, input) => {
        if (name === "search_inbox") return searchInbox(String(input.query ?? ""));
        if (name === "read_thread") {
          const section = await formatThread(String(input.key ?? ""), "THREAD");
          return section ?? "Thread not found.";
        }
        if (name === "search_brain") {
          const { context, sources } = await assembleBrainContext(
            String(input.question ?? ""),
          );
          return `${context.slice(0, 10000)}\n\nSources: ${sources.join("; ")}`;
        }
        return "Unknown tool.";
      },
    });
    return NextResponse.json({
      ok: true,
      text: result.text,
      steps: result.steps,
      model: result.modelUsed,
    });
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
