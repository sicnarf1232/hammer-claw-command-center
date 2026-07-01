import { desc, isNotNull, inArray } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails, emailAttachments } from "@/lib/db/schema";

// Brain retrieval over the email firehose (Milestone 4, sequence F #4). Lets
// /ask answer from real mail: recent email bodies + attachment text, keyword
// matched, citable by thread. Best-effort and bounded; empty if no traffic.

const STOP = new Set([
  "the", "and", "for", "with", "what", "whats", "when", "where", "which", "who",
  "how", "why", "are", "any", "all", "our", "this", "that", "from", "have", "has",
  "about", "into", "out", "get", "give", "tell", "show", "list", "does", "did",
  "email", "emails", "mail", "sent", "reply", "said", "say",
]);

function keywords(q: string): string[] {
  return Array.from(
    new Set(
      q
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w)),
    ),
  );
}

export interface EmailHit {
  title: string;
  snippet: string;
  threadKey: string;
}

export async function retrieveEmails(question: string, limit = 3): Promise<EmailHit[]> {
  if (!dbConfigured()) return [];
  const words = keywords(question);
  if (!words.length) return [];

  let rows: (typeof emails.$inferSelect)[];
  try {
    rows = await getDb()
      .select()
      .from(emails)
      .where(isNotNull(emails.bodyText))
      .orderBy(desc(emails.sentAt))
      .limit(250);
  } catch {
    return [];
  }
  if (!rows.length) return [];

  // Attachment text for these emails, folded into the searchable body.
  const ids = rows.map((r) => r.id);
  const attText = new Map<number, string>();
  try {
    const atts = await getDb()
      .select({ emailId: emailAttachments.emailId, text: emailAttachments.extractedText })
      .from(emailAttachments)
      .where(inArray(emailAttachments.emailId, ids));
    for (const a of atts) {
      if (!a.text) continue;
      attText.set(a.emailId, `${attText.get(a.emailId) ?? ""}\n${a.text}`);
    }
  } catch {
    /* no attachments table */
  }

  const scored = rows.map((r) => {
    const body = `${r.bodyText ?? ""}\n${attText.get(r.id) ?? ""}`;
    const hay = `${r.subject ?? ""} ${body}`.toLowerCase();
    let score = 0;
    for (const w of words) if (hay.includes(w)) score++;
    return { r, body, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r, body }) => ({
      title: `${cleanSubject(r.subject)} — ${r.fromName?.trim() || r.fromEmail || "unknown"}`,
      snippet: snippet(body, words),
      threadKey: r.threadId ? `t:${r.threadId}` : `m:${r.id}`,
    }));
}

function snippet(body: string, words: string[]): string {
  const clean = body.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  let first = -1;
  for (const w of words) {
    const i = lower.indexOf(w);
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  const start = Math.max(0, first - 100);
  return clean.slice(start, start + 500).trim();
}

function cleanSubject(s: string | null): string {
  if (!s) return "(no subject)";
  return s.replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, "").trim() || "(no subject)";
}
