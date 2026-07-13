import Link from "next/link";
import { dbConfigured } from "@/lib/db";
import { listThreads, type ThreadSummary } from "@/lib/firehose/read";
import { getTriageMap, type TriageRow } from "@/lib/firehose/triage";
import { buildInboxRows, reconcileReviewedTriage } from "@/lib/inboxRows";
import InboxWorkspace, { type Folder } from "@/components/InboxWorkspace";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Folder model for the inbox rail. Each folder is a predicate over a thread +
// its triage. Reviewed threads leave "Needs attention" but still live in their
// pathway folder (e.g. a reviewed needs-reply stays in "Needs reply").
const FOLDERS: {
  key: string;
  label: string;
  group: "top" | "pathway";
  match: (t: ThreadSummary, tr?: TriageRow) => boolean;
}[] = [
  { key: "attention", label: "Needs attention", group: "top", match: (t, tr) => !t.archived && !tr?.reviewed && (t.flagged || t.needsReview || Boolean(tr?.needsReply)) },
  { key: "sent", label: "Sent", group: "top", match: (t) => !t.archived && t.outbound > 0 },
  { key: "flagged", label: "Flagged", group: "top", match: (t) => !t.archived && t.flagged },
  { key: "reviewed", label: "Reviewed", group: "top", match: (t, tr) => !t.archived && Boolean(tr?.reviewed) },
  { key: "needs-reply", label: "Needs reply", group: "pathway", match: (t, tr) => !t.archived && tr?.pathway === "needs-reply" },
  { key: "quote-request", label: "Quotes", group: "pathway", match: (t, tr) => !t.archived && tr?.pathway === "quote-request" },
  { key: "quality-pcn", label: "Quality / PCN", group: "pathway", match: (t, tr) => !t.archived && tr?.pathway === "quality-pcn" },
  { key: "logistics", label: "Logistics", group: "pathway", match: (t, tr) => !t.archived && tr?.pathway === "logistics" },
  { key: "fyi", label: "FYI", group: "pathway", match: (t, tr) => !t.archived && tr?.pathway === "fyi" },
  { key: "noise", label: "Noise", group: "pathway", match: (t, tr) => !t.archived && tr?.pathway === "noise" },
  // All mail is a WORKING queue: reviewed mail triages away (it lives on in
  // Reviewed and its pathway folder). Working views drain to zero.
  { key: "all", label: "All mail", group: "top", match: (t, tr) => !t.archived && !tr?.reviewed },
  { key: "archived", label: "Archived", group: "top", match: (t) => t.archived },
];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; view?: string }>;
}) {
  if (!dbConfigured()) {
    return (
      <Shell>
        <SetupNotice missing={["POSTGRES_URL"]} />
      </Shell>
    );
  }

  const sp = await searchParams;
  const requested = sp.folder ?? sp.view ?? "all";
  const folderKey = FOLDERS.some((f) => f.key === requested) ? requested : "all";

  const all = await listThreads({ view: "all", limit: 500 });
  const triage = await getTriageMap(all.map((t) => t.key));

  // Reviewed state expires on new inbound mail (see reconcileReviewedTriage:
  // missing this means missed emails).
  reconcileReviewedTriage(all, triage);

  const folders: Folder[] = FOLDERS.map((f) => ({
    key: f.key,
    label: f.label,
    group: f.group,
    count: all.filter((t) => f.match(t, triage.get(t.key))).length,
  }));

  const active = FOLDERS.find((f) => f.key === folderKey)!;
  const shown = all.filter((t) => active.match(t, triage.get(t.key))).slice(0, 200);
  const threads = await buildInboxRows(shown, triage);

  return (
    <Shell>
      <InboxWorkspace threads={threads} folder={folderKey} folders={folders} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="full-bleed flex h-full min-h-0 flex-col">
      <header className="mb-3 flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="display-title text-[20px] leading-none text-fg">Inbox</h1>
          <div className="eyebrow flex items-center gap-1.5 text-accent">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }}
            />
            Merit OEM · live firehose
          </div>
        </div>
        <Link href="/compose" className="btn-primary shrink-0 whitespace-nowrap text-sm">
          New email
        </Link>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
