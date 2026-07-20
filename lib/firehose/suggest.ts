import { getOpenTasks } from "@/lib/vault";
import { listAccounts } from "@/lib/accounts";
import { toTaskView, buildAccountLookup } from "@/lib/taskView";
import type { Task, Account } from "@/lib/vault/types";

// Smart Action panel (suggestion-only): given a thread's account + text, surface
// the open tasks most likely related, so Jordan can jump to them. It does NOT
// auto-link; it suggests. A real learning/link layer can come later.

export interface TaskSuggestion {
  id: string; // vault task id (sourceFile:sourceLine) for linking
  title: string;
  customer: string | null;
  due: string | null;
  priority: string | null;
  score: number;
}

const STOP = new Set([
  "the", "and", "for", "with", "you", "your", "our", "this", "that", "from",
  "have", "has", "will", "would", "please", "thanks", "thank", "regards", "hi",
  "hello", "re", "fw", "fwd", "email", "reply", "let", "know", "get", "can",
]);

// Exported so other matchers (lib/taskEmailMatch.ts, the dev-feedback #11
// task<->email linker) reuse the same keyword extraction instead of
// duplicating it.
export function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    ),
  ).slice(0, 24);
}

export async function suggestTasksForThread(
  accountName: string | null,
  text: string,
  limit = 3,
): Promise<TaskSuggestion[]> {
  const [tasks, accounts] = await Promise.all([
    getOpenTasks().catch(() => [] as Task[]),
    listAccounts().catch(() => [] as Account[]),
  ]);
  if (!tasks.length) return [];

  const lookup = buildAccountLookup(accounts);
  const views = tasks.map((t) => toTaskView(t, lookup)).filter((t) => t.workstream !== "nextech");
  const words = extractKeywords(text);
  const acct = accountName?.trim().toLowerCase() ?? null;

  const scored = views.map((t) => {
    let score = 0;
    const sameAccount = acct && t.customer && t.customer.toLowerCase() === acct;
    if (sameAccount) score += 4; // same customer is a strong signal
    const hay = `${t.title} ${t.type ?? ""}`.toLowerCase();
    for (const w of words) if (hay.includes(w)) score += 1;
    return { t, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ t, score }) => ({
      id: t.id,
      title: t.title.replace(/\[[A-Za-z][\w-]*::[^\]]*\]/g, "").trim(),
      customer: t.customer ?? null,
      due: t.due ?? null,
      priority: t.priority ?? null,
      score,
    }));
}
