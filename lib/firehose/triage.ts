import { inArray } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emailTriage } from "@/lib/db/schema";
import { aiConfigured, triageEmailThread } from "@/lib/ai";
import { getThread, type ThreadMessage } from "./read";
import { ensureFirehoseSchema } from "./schema";

export type TriageRow = typeof emailTriage.$inferSelect;

export interface Triage {
  summary: string | null;
  pathway: string | null;
  priority: string | null;
  needsReply: boolean;
}

// Pathway display metadata (label + token color) for the inbox chips.
export const PATHWAY_META: Record<string, { label: string; color: string }> = {
  "needs-reply": { label: "Needs reply", color: "var(--due)" },
  "quote-request": { label: "Quote", color: "var(--accent)" },
  "quality-pcn": { label: "Quality / PCN", color: "var(--warm)" },
  logistics: { label: "Logistics", color: "var(--c-info)" },
  fyi: { label: "FYI", color: "var(--ink-3)" },
  noise: { label: "Noise", color: "var(--ink-3)" },
};

function textOf(m: ThreadMessage): string {
  if (m.bodyText?.trim()) return m.bodyText;
  if (m.bodyHtml?.trim()) {
    return m.bodyHtml
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return m.bodyPreview ?? "";
}

// A thread's state fingerprint: message count + newest message id. Triage
// re-runs when a new message arrives.
function signatureOf(messages: ThreadMessage[]): string {
  const last = messages[messages.length - 1];
  return `${messages.length}:${last?.id ?? 0}`;
}

export async function getTriageMap(keys: string[]): Promise<Map<string, TriageRow>> {
  const out = new Map<string, TriageRow>();
  const unique = Array.from(new Set(keys));
  if (!unique.length || !dbConfigured()) return out;
  try {
    const rows = await getDb()
      .select()
      .from(emailTriage)
      .where(inArray(emailTriage.threadKey, unique));
    for (const r of rows) out.set(r.threadKey, r);
  } catch {
    /* table absent */
  }
  return out;
}

// Triage the given thread keys that are missing or stale, up to `max`. Returns a
// map of freshly-written triage keyed by threadKey. Bounded so one request stays
// under the serverless time cap.
export async function ensureTriageForKeys(
  keys: string[],
  max = 6,
): Promise<Map<string, Triage>> {
  const result = new Map<string, Triage>();
  if (!aiConfigured() || !dbConfigured() || !keys.length) return result;
  await ensureFirehoseSchema();
  const existing = await getTriageMap(keys);

  // Which keys need work: load each thread, compare signature.
  const todo: { key: string; messages: ThreadMessage[]; subject: string; signature: string }[] = [];
  for (const key of keys) {
    if (todo.length >= max) break;
    const { subject, messages } = await getThread(key);
    if (messages.length === 0) continue;
    const signature = signatureOf(messages);
    const prev = existing.get(key);
    // Respect manual triage: never auto-overwrite what Jordan set himself.
    if (prev && (prev.manual || prev.reviewed)) continue;
    if (prev && prev.signature === signature) continue; // fresh
    todo.push({ key, messages, subject, signature });
  }

  const db = getDb();
  // Small concurrency so a batch of Haiku calls finishes quickly.
  const chunks = chunk(todo, 3);
  for (const group of chunks) {
    await Promise.all(
      group.map(async (item) => {
        try {
          const account =
            item.messages.find((m) => m.accountId != null)?.accountId != null
              ? String(item.messages.find((m) => m.accountId != null)!.accountId)
              : null;
          const t = await triageEmailThread({
            subject: item.subject,
            account,
            messages: item.messages.map((m) => ({
              direction: m.direction,
              from: m.fromName?.trim() || m.fromEmail || "unknown",
              at: (m.sentAt ?? m.receivedAt)?.toISOString?.() ?? null,
              text: textOf(m),
            })),
          });
          await db
            .insert(emailTriage)
            .values({
              threadKey: item.key,
              summary: t.summary,
              pathway: t.pathway,
              priority: t.priority,
              needsReply: t.needsReply,
              signature: item.signature,
              model: process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-4-5-20251001",
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: emailTriage.threadKey,
              set: {
                summary: t.summary,
                pathway: t.pathway,
                priority: t.priority,
                needsReply: t.needsReply,
                signature: item.signature,
                updatedAt: new Date(),
              },
            });
          result.set(item.key, {
            summary: t.summary,
            pathway: t.pathway,
            priority: t.priority,
            needsReply: t.needsReply,
          });
        } catch (err) {
          console.error("[triage] failed for", item.key, err);
        }
      }),
    );
  }
  return result;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export interface ManualTriageInput {
  pathway?: string;
  needsReply?: boolean;
  reviewed?: boolean;
  summary?: string;
}

// Jordan manually triages a thread. Sets manual=true so auto-triage won't
// overwrite it. Upserts the triage row (creates one if the thread was never
// auto-triaged).
export async function setManualTriage(key: string, input: ManualTriageInput): Promise<void> {
  await ensureFirehoseSchema();
  const db = getDb();
  const now = new Date();
  const updates: Partial<typeof emailTriage.$inferInsert> = { manual: true, updatedAt: now };
  if (input.pathway !== undefined) {
    updates.pathway = input.pathway;
    // Pathway drives needs-reply unless explicitly overridden below.
    updates.needsReply = input.pathway === "needs-reply";
  }
  if (input.needsReply !== undefined) updates.needsReply = input.needsReply;
  if (input.summary !== undefined) updates.summary = input.summary;
  if (input.reviewed !== undefined) {
    updates.reviewed = input.reviewed;
    updates.reviewedAt = input.reviewed ? now : null;
  }
  await db
    .insert(emailTriage)
    .values({
      threadKey: key,
      pathway: updates.pathway ?? null,
      needsReply: updates.needsReply ?? false,
      summary: updates.summary ?? null,
      reviewed: updates.reviewed ?? false,
      reviewedAt: updates.reviewedAt ?? null,
      manual: true,
      signature: "manual",
      updatedAt: now,
    })
    .onConflictDoUpdate({ target: emailTriage.threadKey, set: updates });
}
