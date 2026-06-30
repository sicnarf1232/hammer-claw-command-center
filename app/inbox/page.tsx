import { dbConfigured } from "@/lib/db";
import { vaultConfigured, getRoster } from "@/lib/vault";
import { rosterAccounts } from "@/lib/vault/roster";
import { getQueue } from "@/lib/inbox";
import { classifyEmail } from "@/lib/classify";
import InboxItem, { type InboxEmail } from "@/components/InboxItem";
import SetupNotice from "@/components/SetupNotice";
import type { Roster } from "@/lib/vault/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InboxPage() {
  const missing: string[] = [];
  if (!dbConfigured()) missing.push("POSTGRES_URL");
  if (!vaultConfigured()) missing.push("GITHUB_TOKEN", "VAULT_REPO");
  if (missing.length > 0) {
    return (
      <Page>
        <SetupNotice missing={missing} />
        <p className="mt-3 max-w-2xl text-sm text-muted">
          The inbox needs the database (to hold the email queue) and vault access
          (to file notes back). Until Power Automate Flow A is wired up, the queue
          will be empty. See PUNCHLIST.md sections 3 and 4.
        </p>
      </Page>
    );
  }

  // Roster is best-effort for classification suggestions; tolerate failure.
  let roster: Roster = new Map();
  let accounts: string[] = [];
  try {
    roster = await getRoster();
    accounts = rosterAccounts(roster);
  } catch {
    /* classification falls back to address/domain signals only */
  }

  const rows = await getQueue(["new", "filed", "replied"]);

  const items = rows.map((r) => {
    const suggestion = classifyEmail(
      {
        fromName: r.fromName,
        fromEmail: r.fromEmail,
        toAddrs: r.toAddrs,
        subject: r.subject,
      },
      roster,
      accounts,
    );
    const email: InboxEmail = {
      id: r.id,
      fromName: r.fromName,
      fromEmail: r.fromEmail,
      subject: r.subject,
      bodyPreview: r.bodyPreview,
      receivedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
      webLink: r.webLink,
      hasAttachments: r.hasAttachments,
      status: r.status,
      filedPath: r.filedPath,
      account: r.account,
      workstream: r.workstream,
    };
    return { email, suggestion };
  });

  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <Page subtitle={`${newCount} new, ${rows.length} in view`}>
      {items.length === 0 ? (
        <div className="card max-w-2xl p-8 text-center">
          <div className="text-sm font-medium text-fg">Inbox is empty</div>
          <p className="mt-1 text-sm text-muted">
            Flag an email into the{" "}
            <code className="font-mono text-fg/75">ToHC</code> folder in Outlook
            and it will appear here within a minute, once Flow A is wired.
          </p>
        </div>
      ) : (
        <div className="grid max-w-3xl gap-3">
          {items.map(({ email, suggestion }) => (
            <InboxItem key={email.id} email={email} suggestion={suggestion} />
          ))}
        </div>
      )}
    </Page>
  );
}

function Page({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="display-title text-2xl text-fg">Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          Flagged emails from Outlook. Classify, then file into the right
          workstream Inbox.
          {subtitle ? (
            <>
              {" "}
              <span className="font-mono tabular-nums text-fg/70">
                {subtitle}
              </span>
            </>
          ) : null}
        </p>
      </header>
      {children}
    </div>
  );
}
