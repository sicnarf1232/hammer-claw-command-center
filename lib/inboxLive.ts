import type { InboxThread } from "@/components/InboxWorkspace";

// Pure client-side logic for the live inbox poll: folder membership for a
// delta row and the quiet list merge. Kept out of the component so both are
// unit-testable.

// Mirrors the FOLDERS predicates in app/inbox/page.tsx over the fields the
// client actually has. Unknown keys are treated as pathway folders.
export function matchesFolder(t: InboxThread, folder: string): boolean {
  if (folder === "archived") return t.archived;
  if (t.archived) return false;
  switch (folder) {
    case "attention":
      return !t.reviewed && (t.flagged || t.needsReview || t.needsReply);
    case "sent":
      return t.outbound > 0;
    case "flagged":
      return t.flagged;
    case "reviewed":
      return t.reviewed;
    case "all":
      return !t.reviewed;
    default:
      return t.pathway === folder;
  }
}

// One quiet merge per poll response: rows keyed by thread key so a pushed
// message updates in place instead of duplicating; genuinely new threads join
// only when they belong in the current folder. Rows never disappear here
// (local overrides and the next full server render handle removal), and the
// merged list re-sorts by the same activity anchor the server sorts by.
export function mergeThreadDelta(
  existing: InboxThread[],
  incoming: InboxThread[],
  folder: string,
): { threads: InboxThread[]; added: number } {
  if (incoming.length === 0) return { threads: existing, added: 0 };
  const byKey = new Map(existing.map((t) => [t.key, t] as const));
  let changed = false;
  let added = 0;
  for (const t of incoming) {
    if (byKey.has(t.key)) {
      byKey.set(t.key, t);
      changed = true;
    } else if (matchesFolder(t, folder)) {
      byKey.set(t.key, t);
      added++;
      changed = true;
    }
  }
  if (!changed) return { threads: existing, added: 0 };
  const at = (t: InboxThread) => (t.lastAtISO ? Date.parse(t.lastAtISO) : 0);
  const threads = Array.from(byKey.values()).sort((a, b) => at(b) - at(a));
  return { threads, added };
}
