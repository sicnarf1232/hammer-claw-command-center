import { dbConfigured } from "@/lib/db";
import {
  listThreads,
  threadCounts,
  accountNames,
  type InboxView,
} from "@/lib/firehose/read";
import InboxList, { type InboxThread } from "@/components/InboxList";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Unified inbox (Milestone 4): one thread-first view over the whole Merit OEM
// firehose. Flagged = you flagged it in Outlook; needs-review = unmapped sender.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (!dbConfigured()) {
    return (
      <Shell>
        <SetupNotice missing={["POSTGRES_URL"]} />
      </Shell>
    );
  }

  const sp = await searchParams;
  const view: InboxView =
    sp.view === "flagged" || sp.view === "all" ? sp.view : "attention";

  const [rawThreads, counts] = await Promise.all([
    listThreads({ view, limit: 150 }),
    threadCounts(),
  ]);
  const accounts = await accountNames(
    rawThreads.map((t) => t.accountId).filter((x): x is number => x != null),
  );

  const threads: InboxThread[] = rawThreads.map((t) => {
    const acct = t.accountId != null ? accounts.get(t.accountId) : undefined;
    return {
      key: t.key,
      subject: t.subject,
      preview: t.preview,
      lastAtISO: t.lastAt ? t.lastAt.toISOString() : null,
      count: t.count,
      inbound: t.inbound,
      outbound: t.outbound,
      lastDirection: t.lastDirection,
      who: t.parties.length ? t.parties.join(", ") : "You",
      accountName: acct?.name ?? null,
      accountSlug: acct?.slug ?? null,
      needsReview: t.needsReview,
      hasAttachments: t.hasAttachments,
      flagged: t.flagged,
      replied: t.replied,
      unread: t.unread,
    };
  });

  return (
    <Shell>
      <InboxList threads={threads} view={view} counts={counts} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="mb-5">
        <div className="eyebrow flex items-center gap-1.5 text-accent">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }}
          />
          Merit OEM · live firehose
        </div>
        <h1 className="mt-1 display-title text-[28px] text-fg">Inbox</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Every inbound and outbound message, threaded and mapped to accounts. Open
          a thread to read the full chain and reply.
        </p>
      </header>
      {children}
    </div>
  );
}
