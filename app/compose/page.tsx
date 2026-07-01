import Link from "next/link";
import Composer from "@/components/Composer";
import { getEmailById } from "@/lib/firehose/actions";
import { cleanSubject } from "@/lib/firehose/read";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ forwardId?: string }>;
}) {
  const { forwardId } = await searchParams;
  const fwdId = forwardId ? Number(forwardId) : NaN;
  const source = Number.isInteger(fwdId) ? await getEmailById(fwdId) : null;
  const mode = source ? "forward" : "new";
  const subject = source ? `FW: ${cleanSubject(source.subject) || "(no subject)"}` : "";

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/inbox" className="text-xs text-muted hover:text-fg">
        ← Inbox
      </Link>
      <header className="mb-4 mt-2">
        <h1 className="display-title text-2xl">{mode === "forward" ? "Forward email" : "New email"}</h1>
      </header>
      <Composer
        mode={mode}
        forwardId={source ? source.id : undefined}
        initialSubject={subject}
        forwardFrom={source ? source.fromName?.trim() || source.fromEmail : null}
      />
    </div>
  );
}
