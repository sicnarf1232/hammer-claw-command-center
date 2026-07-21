import Link from "next/link";
import Composer from "@/components/Composer";
import { getEmailById } from "@/lib/firehose/actions";
import { cleanSubject } from "@/lib/firehose/read";
import { getAccountBySlug } from "@/lib/accounts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ComposePage({
  searchParams,
}: {
  // dev-feedback #18: "Create new email" from a task's detail view lands
  // here with `account` (the task's linked account slug) and `subject` (a
  // sensible default referencing the task) so Jordan gets one click to a
  // compose page with useful context, not a blank form.
  searchParams: Promise<{ forwardId?: string; account?: string; subject?: string }>;
}) {
  const { forwardId, account: accountSlug, subject: subjectParam } = await searchParams;
  const fwdId = forwardId ? Number(forwardId) : NaN;
  const source = Number.isInteger(fwdId) ? await getEmailById(fwdId) : null;
  const mode = source ? "forward" : "new";
  const subject = source
    ? `FW: ${cleanSubject(source.subject) || "(no subject)"}`
    : subjectParam ?? "";

  // Best-effort: an unknown/removed slug just means no prefill, never a
  // broken compose page.
  const account =
    !source && accountSlug ? await getAccountBySlug(accountSlug).catch(() => null) : null;
  const initialTo = account?.contacts.find((c) => c.email)?.email ?? undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/inbox" className="text-xs text-muted hover:text-fg">
        ← Inbox
      </Link>
      <header className="mb-4 mt-2">
        <h1 className="display-title text-2xl">{mode === "forward" ? "Forward email" : "New email"}</h1>
        {account ? (
          <p className="mt-1 text-xs text-muted">For {account.name}. Recipient search still works if this isn't who you want.</p>
        ) : null}
      </header>
      <Composer
        mode={mode}
        forwardId={source ? source.id : undefined}
        initialSubject={subject}
        initialTo={initialTo}
        forwardFrom={source ? source.fromName?.trim() || source.fromEmail : null}
      />
    </div>
  );
}
