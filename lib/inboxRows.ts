import { accountNames, type ThreadSummary } from "@/lib/firehose/read";
import type { TriageRow } from "@/lib/firehose/triage";
import { linkedTaskContextForThreads } from "@/lib/inboxContext";
import { personCardsForEmails } from "@/lib/peopleDb";
import { prettyLocalPart } from "@/lib/inboxThread";
import type { InboxThread } from "@/components/InboxWorkspace";

// A review only counts until the next inbound message: when new mail
// arrives on a reviewed thread, it comes back as unreviewed AND as
// needing attention (they wrote after Jordan closed it, so it demands
// eyes until he reviews again). Missing this means missed emails.
export function reconcileReviewedTriage(
  threads: ThreadSummary[],
  triage: Map<string, TriageRow>,
): void {
  for (const t of threads) {
    const tr = triage.get(t.key);
    if (
      tr?.reviewed &&
      t.lastInboundAt &&
      (!tr.reviewedAt || tr.reviewedAt < t.lastInboundAt)
    ) {
      triage.set(t.key, { ...tr, reviewed: false, needsReply: true });
    }
  }
}

// Assemble client-ready inbox rows from thread summaries: triage overlay,
// account names, linked tasks, and people-resolved sender names. Shared by
// the inbox page render and the live delta poll so both shapes match.
export async function buildInboxRows(
  shown: ThreadSummary[],
  triage: Map<string, TriageRow>,
): Promise<InboxThread[]> {
  const partyEmails = Array.from(
    new Set(shown.flatMap((t) => t.parties.filter((p) => p.includes("@")))),
  );
  const [accounts, linkedTasks, cards] = await Promise.all([
    accountNames(shown.map((t) => t.accountId).filter((x): x is number => x != null)),
    linkedTaskContextForThreads(shown.map((t) => t.key)).catch(
      () => new Map<string, never>(),
    ),
    personCardsForEmails(partyEmails).catch(() => new Map()),
  ]);

  // Parties arrive as "name or raw address"; resolve addresses to real names
  // via the people table, else prettify the local part.
  const displayName = (p: string) =>
    p.includes("@") ? (cards.get(p.toLowerCase())?.fullName ?? prettyLocalPart(p)) : p;

  return shown.map((t) => {
    const acct = t.accountId != null ? accounts.get(t.accountId) : undefined;
    const tr = triage.get(t.key);
    const anchor = t.lastInboundAt ?? t.lastAt;
    return {
      key: t.key,
      subject: t.subject,
      preview: t.preview,
      lastAtISO: anchor ? anchor.toISOString() : null,
      count: t.count,
      inbound: t.inbound,
      outbound: t.outbound,
      lastDirection: t.lastDirection,
      who: t.parties.length ? t.parties.map(displayName).join(", ") : "You",
      accountName: acct?.name ?? null,
      accountSlug: acct?.slug ?? null,
      needsReview: t.needsReview,
      hasAttachments: t.hasAttachments,
      flagged: t.flagged,
      replied: t.replied,
      unread: t.unread,
      summary: tr?.summary ?? null,
      pathway: tr?.pathway ?? null,
      priority: tr?.priority ?? null,
      needsReply: Boolean(tr?.needsReply),
      reviewed: Boolean(tr?.reviewed),
      archived: t.archived,
      linkedTask: linkedTasks.get(t.key) ?? null,
    };
  });
}
