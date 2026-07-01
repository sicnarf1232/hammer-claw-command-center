import { dbConfigured } from "@/lib/db";
import { listThreads, accountNames, type InboxView } from "@/lib/firehose/read";
import { getTriageMap } from "@/lib/firehose/triage";
import InboxList, { type InboxThread } from "@/components/InboxList";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Unified inbox (Milestone 4): one thread-first view over the whole Merit OEM
// firehose, with AI triage. Needs-attention = flagged, unmapped, or the triage
// says Jordan still owes a reply.
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

  // Load the full recent set once, then derive counts + the current view from it
  // (so the tab counts stay consistent and include AI needs-reply).
  const all = await listThreads({ view: "all", limit: 400 });
  const triage = await getTriageMap(all.map((t) => t.key));

  const isAttention = (t: (typeof all)[number]) => {
    const tr = triage.get(t.key);
    if (t.archived || tr?.reviewed) return false;
    return t.flagged || t.needsReview || Boolean(tr?.needsReply);
  };

  const counts = {
    all: all.length,
    attention: all.filter(isAttention).length,
    flagged: all.filter((t) => t.flagged && !t.archived).length,
  };

  let shown = all;
  if (view === "attention") shown = all.filter(isAttention);
  else if (view === "flagged") shown = all.filter((t) => t.flagged && !t.archived);
  shown = shown.slice(0, 150);

  const accounts = await accountNames(
    shown.map((t) => t.accountId).filter((x): x is number => x != null),
  );

  const threads: InboxThread[] = shown.map((t) => {
    const acct = t.accountId != null ? accounts.get(t.accountId) : undefined;
    const tr = triage.get(t.key);
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
      summary: tr?.summary ?? null,
      pathway: tr?.pathway ?? null,
      priority: tr?.priority ?? null,
      needsReply: Boolean(tr?.needsReply),
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
          Every inbound and outbound message, threaded, mapped to accounts, and
          triaged by AI. Open a thread to read the full chain and reply.
        </p>
      </header>
      {children}
    </div>
  );
}
