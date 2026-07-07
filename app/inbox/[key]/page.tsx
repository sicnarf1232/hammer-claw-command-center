import Link from "next/link";
import { notFound } from "next/navigation";
import { PATHWAY_META } from "@/lib/firehose/triage";
import { crossCustomerPlaybook } from "@/lib/firehose/playbook";
import { docTypeLabel } from "@/lib/documents";
import { getThreadViewData } from "@/lib/inboxThread";
import ThreadActions from "@/components/ThreadActions";
import TriageBar from "@/components/TriageBar";
import SenderSuggest from "@/components/SenderSuggest";
import ThreadActionComposer from "@/components/ThreadActionComposer";
import ThreadMessages from "@/components/ThreadMessages";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const decoded = decodeURIComponent(key);
  const data = await getThreadViewData(decoded);
  if (!data) notFound();

  const {
    subject,
    count,
    messageIds,
    latestMessageId,
    acct,
    flagged,
    archived,
    threadMsgs,
    triage,
    externalParticipants,
    internalParticipants,
    senderSuggestion,
    docSuggestions,
    taskSuggestions,
    quoteHref,
  } = data;

  const path = triage?.pathway ? PATHWAY_META[triage.pathway] : null;
  const participantCount = externalParticipants.length + internalParticipants.length;

  // Cross-customer playbook: prior work on the same kind of thing for other
  // accounts. Only for quality/PCN and quote pathways.
  const suggestText = `${subject} ${triage?.summary ?? ""}`;
  const playbook = await crossCustomerPlaybook(triage?.pathway ?? null, acct?.name ?? null, suggestText).catch(
    () => null,
  );

  return (
    <div className="max-w-none">
      <Link href="/inbox" className="text-xs text-muted hover:text-fg">
        ← Inbox
      </Link>
      <header className="mb-5 mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{subject}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <span className="tabular-nums">{count} messages</span>
            {acct ? (
              <Link
                href={`/accounts/${acct.slug}`}
                className="chip border-border text-fg/75"
              >
                {acct.name}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/compose?forwardId=${latestMessageId}`}
            className="btn-outline whitespace-nowrap text-xs"
          >
            Forward
          </Link>
          <ThreadActions
            ids={messageIds}
            flagged={flagged}
            archived={archived}
          />
        </div>
      </header>

      {participantCount ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface px-3 py-2.5">
          {externalParticipants.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow text-[9px] text-muted">External</span>
              {externalParticipants.map((p) => (
                <span
                  key={p.email}
                  className="rounded-full px-2 py-0.5 text-2xs font-semibold"
                  style={{ background: "var(--due-soft)", color: "var(--due-ink)" }}
                  title={p.email}
                >
                  {p.name}
                </span>
              ))}
            </div>
          ) : null}
          {internalParticipants.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow text-[9px] text-muted">Internal</span>
              {internalParticipants.map((p) => (
                <span
                  key={p.email}
                  className="rounded-full px-2 py-0.5 text-2xs font-semibold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                  title={p.email}
                >
                  {p.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {senderSuggestion ? (
        <SenderSuggest
          address={senderSuggestion.address}
          name={senderSuggestion.name}
          suggestion={senderSuggestion.suggestion}
          accounts={senderSuggestion.accounts}
        />
      ) : null}

      {quoteHref ? (
        <div
          className="mb-4 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--accent-soft)", background: "var(--accent-soft)" }}
        >
          <div>
            <div className="eyebrow text-accent">Quote request detected</div>
            <p className="mt-0.5 text-sm text-fg/85">
              Start a Merit OEM quote prefilled from this email. The line items parse in
              automatically for you to review.
            </p>
          </div>
          <Link href={quoteHref} className="btn-primary shrink-0 whitespace-nowrap text-sm">
            Create quote
          </Link>
        </div>
      ) : null}

      {triage?.summary || docSuggestions.length ? (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {triage?.summary ? (
            <div
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--accent-soft)", background: "var(--accent-soft)" }}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <SparkGlyph />
                <span className="eyebrow text-accent">AI summary</span>
                {path ? (
                  <span
                    className="ml-1 rounded-full px-2 py-0.5 text-2xs font-semibold"
                    style={{ background: "var(--surface)", color: path.color }}
                  >
                    {path.label}
                  </span>
                ) : null}
                {triage.priority === "high" ? (
                  <span className="rounded-full bg-surface px-2 py-0.5 text-2xs font-bold text-dueInk">
                    High priority
                  </span>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed text-fg/85">{triage.summary}</p>
              {triage.needsReply ? (
                <p className="mt-1.5 text-xs font-medium text-accent">You still owe a reply.</p>
              ) : null}
            </div>
          ) : null}

          {docSuggestions.length ? (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <SparkGlyph />
                <span className="eyebrow text-accent">Suggested attachments</span>
              </div>
              <ul className="space-y-2">
                {docSuggestions.map((d) => (
                  <li key={d.id} className="text-sm">
                    <a
                      href={`/api/documents/file?id=${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-fg hover:text-accent"
                    >
                      📎 {d.title}
                    </a>
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-2xs text-muted">
                      <span>{docTypeLabel(d.docType)}</span>
                      {d.account ? <span>· {d.account}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-muted">
                From your document library. Open to reference in your reply.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {playbook && playbook.items.length ? (
        <details className="mb-4 rounded-2xl border" style={{ borderColor: "var(--warm)", background: "var(--warm-soft)" }}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold" style={{ color: "var(--warm)" }}>
            <PlaybookGlyph />
            Cross-customer playbook
            <span className="rounded-full bg-surface px-2 py-0.5 text-2xs font-bold" style={{ color: "var(--warm)" }}>
              {playbook.items.length}
            </span>
            <span className="ml-auto text-2xs font-normal text-muted">
              How we handled this for other accounts
            </span>
          </summary>
          <div className="px-4 pb-3">
            <ul className="space-y-1.5">
              {playbook.items.map((it) => (
                <li key={it.id}>
                  <a
                    href={`/api/documents/file?id=${it.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface2"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">📎 {it.title}</span>
                    <span className="shrink-0 text-2xs text-muted">{docTypeLabel(it.docType)}</span>
                    {it.account ? <span className="shrink-0 text-2xs font-semibold text-warm">{it.account}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-2xs text-muted">
              Precedent from your document library. Reuse the approach, not the customer specifics.
            </p>
          </div>
        </details>
      ) : null}

      <TriageBar
        threadKey={decoded}
        pathway={triage?.pathway ?? null}
        reviewed={Boolean(triage?.reviewed)}
        aiGenerated={Boolean(triage?.aiGenerated) && !triage?.manual}
        model={triage?.model ?? null}
      />

      <div className="mt-4">
        <ThreadActionComposer
          threadKey={decoded}
          customer={acct?.name ?? null}
          tasks={taskSuggestions.map((s) => ({
            id: s.id,
            title: s.title,
            customer: s.customer,
            due: s.due,
            priority: s.priority,
          }))}
        />
      </div>

      <ThreadMessages
        messages={threadMsgs}
        subject={subject}
        threadKey={decoded}
        suggestedDocs={docSuggestions.map((d) => ({ id: d.id, title: d.title, docType: d.docType }))}
      />
    </div>
  );
}

function SparkGlyph() {
  return (
    <svg className="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.6a2 2 0 0 0 1.3 1.3L21 11l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 11l5.8-1.9a2 2 0 0 0 1.3-1.3z" />
    </svg>
  );
}

function PlaybookGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
