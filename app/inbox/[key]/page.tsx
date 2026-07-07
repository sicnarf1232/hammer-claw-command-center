import Link from "next/link";
import { notFound } from "next/navigation";
import { getThread, accountNames, type ThreadMessage } from "@/lib/firehose/read";
import {
  ensureTriageForKeys,
  getTriageMap,
  PATHWAY_META,
  type TriageRow,
} from "@/lib/firehose/triage";
import { markRead } from "@/lib/firehose/actions";
import { suggestTasksForThread } from "@/lib/firehose/suggest";
import { suggestDocsForThread } from "@/lib/firehose/docSuggest";
import { crossCustomerPlaybook } from "@/lib/firehose/playbook";
import { suggestAccountForEmail, listDbAccounts } from "@/lib/firehose/senderSuggest";
import { isInternal } from "@/lib/firehose/map";
import { docTypeLabel } from "@/lib/documents";
import { aiConfigured } from "@/lib/ai";
import ThreadActions from "@/components/ThreadActions";
import TriageBar from "@/components/TriageBar";
import SenderSuggest from "@/components/SenderSuggest";
import ThreadActionComposer from "@/components/ThreadActionComposer";
import ThreadMessages, { type ThreadMsg, type PersonRef } from "@/components/ThreadMessages";
import { formatEmailBody } from "@/lib/emailFormat";
import { personCardsForEmails, type PersonCard } from "@/lib/peopleDb";

const JORDAN = "jordan.francis@merit.com";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const decoded = decodeURIComponent(key);
  const { subject, messages } = await getThread(decoded);
  if (messages.length === 0) notFound();

  const acctId = messages.find((m) => m.accountId != null)?.accountId ?? null;
  const acct = acctId != null ? (await accountNames([acctId])).get(acctId) : undefined;

  // Opening a thread marks it read in the inbox.
  await markRead(messages.map((m) => m.id)).catch(() => {});

  const flagged = messages.some((m) => m.flagged);
  const archived = messages[messages.length - 1].status === "archived";
  // Reply targets the most recent inbound message (reply to the customer).
  const latestInbound = [...messages].reverse().find((m) => m.direction === "inbound");

  // Sending identities on this thread (Jordan + any outbound sender): never
  // reply to ourselves.
  const self = new Set<string>([JORDAN]);
  for (const m of messages) {
    if (m.direction === "outbound" && m.fromEmail) self.add(m.fromEmail.toLowerCase());
  }
  const everyone = new Set<string>();
  for (const m of messages) {
    if (m.fromEmail) everyone.add(m.fromEmail.toLowerCase());
    for (const r of m.recipients ?? []) if (r?.email) everyone.add(r.email.toLowerCase());
  }

  // Contact cards for everyone on the thread (name-first chips with the
  // address + title/account on hover).
  const cards = await personCardsForEmails([...everyone]).catch(
    () => new Map<string, PersonCard>(),
  );

  // Conversation view: newest first, each message carrying its own reply set.
  const threadMsgs: ThreadMsg[] = [...messages]
    .reverse()
    .map((m) => toThreadMsg(m, self, cards));

  // Participant map: everyone on the thread (minus Jordan), split into external
  // (customer) and internal (Merit) with display names.
  const nameByEmail = new Map<string, string>();
  for (const m of messages) {
    if (m.fromEmail) nameByEmail.set(m.fromEmail.toLowerCase(), m.fromName?.trim() || m.fromEmail);
    for (const r of m.recipients ?? []) if (r?.email) nameByEmail.set(r.email.toLowerCase(), r.name?.trim() || r.email);
  }
  const participants = [...everyone]
    .filter((a) => a !== JORDAN)
    .map((a) => ({ email: a, name: nameByEmail.get(a) ?? a, internal: isInternal(a) }));
  const externalParticipants = participants.filter((p) => !p.internal);
  const internalParticipants = participants.filter((p) => p.internal);

  // Ensure this thread is triaged (one Haiku call when stale), then read it back.
  let triage: TriageRow | null = null;
  if (aiConfigured()) {
    await ensureTriageForKeys([decoded], 1).catch(() => {});
    triage = (await getTriageMap([decoded])).get(decoded) ?? null;
  }
  const path = triage?.pathway ? PATHWAY_META[triage.pathway] : null;

  // Smart Action panel: suggested related open tasks. Only when the thread is
  // mapped to a customer account and is not noise/FYI, so we never suggest
  // linking a newsletter to an unrelated customer.
  const relevantForActions =
    Boolean(acct?.name) && triage?.pathway !== "noise" && triage?.pathway !== "fyi";
  const suggestText = `${subject} ${triage?.summary ?? ""}`;
  const taskSuggestions = relevantForActions
    ? await suggestTasksForThread(acct?.name ?? null, suggestText, 3).catch(() => [])
    : [];

  // Quote handoff: a thread triaged as a quote request gets a one-tap "Create
  // quote" that opens the Quote builder prefilled (customer, contact) with the
  // email text queued to auto-parse into line items.
  const isQuoteRequest = triage?.pathway === "quote-request";
  const quoteParseText =
    isQuoteRequest && latestInbound
      ? `${subject}\n${(latestInbound.bodyText ?? latestInbound.bodyPreview ?? "").slice(0, 1500)}`
      : "";
  const quoteHref = isQuoteRequest
    ? `/quote?customer=${encodeURIComponent(acct?.name ?? "")}&contact=${encodeURIComponent(
        latestInbound?.fromName?.trim() || latestInbound?.fromEmail || "",
      )}&parse=${encodeURIComponent(quoteParseText)}`
    : null;

  // Suggest-attach: library documents relevant to this thread, so a reply can
  // reference the right spec/cert/quote. Only when there is a reply to write and
  // the thread is not noise/FYI.
  const docSuggestions =
    latestInbound && triage?.pathway !== "noise" && triage?.pathway !== "fyi"
      ? await suggestDocsForThread(acct?.name ?? null, suggestText, 3).catch(() => [])
      : [];

  // Cross-customer playbook: prior work on the same kind of thing for other
  // accounts. Only for quality/PCN and quote pathways.
  const playbook = await crossCustomerPlaybook(triage?.pathway ?? null, acct?.name ?? null, suggestText).catch(
    () => null,
  );

  // Sender suggestion: only for an EXTERNAL, unmapped inbound sender. Internal
  // (@merit.com / meritoem.com) is never a customer, so no card. Offer both the
  // domain suggestion and a manual picker over all accounts.
  let senderSuggestion: {
    address: string;
    name: string | null;
    suggestion: { accountId: number; name: string } | null;
    accounts: { id: number; name: string }[];
  } | null = null;
  if (acctId == null && latestInbound?.fromEmail && !isInternal(latestInbound.fromEmail)) {
    const [s, allAccounts] = await Promise.all([
      suggestAccountForEmail(latestInbound.fromEmail).catch(() => null),
      listDbAccounts().catch(() => []),
    ]);
    senderSuggestion = {
      address: latestInbound.fromEmail,
      name: latestInbound.fromName ?? null,
      suggestion: s ? { accountId: s.accountId, name: s.name } : null,
      accounts: allAccounts,
    };
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/inbox" className="text-xs text-muted hover:text-fg">
        ← Inbox
      </Link>
      <header className="mb-5 mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{subject}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <span className="tabular-nums">{messages.length} messages</span>
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
            href={`/compose?forwardId=${messages[messages.length - 1].id}`}
            className="btn-outline whitespace-nowrap text-xs"
          >
            Forward
          </Link>
          <ThreadActions
            ids={messages.map((m) => m.id)}
            flagged={flagged}
            archived={archived}
          />
        </div>
      </header>

      {participants.length ? (
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
        suggestedDocs={docSuggestions.map((d) => ({ id: d.id, title: d.title, docType: d.docType }))}
      />
    </div>
  );
}

// Serialize a message for the client conversation view: cleaned body split
// from its quoted history, internal/external, and the reply-all set anchored
// to THIS message (inbound: reply to the sender + copy the rest; outbound:
// follow up with the same recipients).
function personRef(
  email: string,
  fallbackName: string | null | undefined,
  cards: Map<string, PersonCard>,
): PersonRef {
  const card = cards.get(email);
  return {
    email,
    name: card?.fullName ?? fallbackName?.trim() ?? email,
    title: card?.title ?? null,
    accountName: card?.accountName ?? null,
    internal: isInternal(email) || card?.classification === "internal",
  };
}

function toThreadMsg(
  m: ThreadMessage,
  selfSet: Set<string>,
  cards: Map<string, PersonCard>,
): ThreadMsg {
  const { main, quoted } = formatEmailBody(m);
  const recips = (m.recipients ?? [])
    .filter((r) => r?.email && r.role !== "from")
    .map((r) => ({ email: r.email.toLowerCase(), name: r.name ?? r.email, cc: r.role === "cc" }));
  const from = m.fromEmail?.toLowerCase() ?? null;

  let replyTo: string[] = [];
  let replyCc: string[] = [];
  if (m.direction === "inbound" && from) {
    replyTo = [from];
    replyCc = dedupe(recips.map((r) => r.email).filter((a) => !selfSet.has(a) && a !== from));
  } else {
    // Outbound: continue to the same audience.
    replyTo = dedupe(recips.filter((r) => !r.cc).map((r) => r.email).filter((a) => !selfSet.has(a)));
    replyCc = dedupe(recips.filter((r) => r.cc).map((r) => r.email).filter((a) => !selfSet.has(a)));
    if (!replyTo.length) replyTo = replyCc.splice(0, replyCc.length);
  }

  return {
    id: m.id,
    direction: m.direction === "outbound" ? "outbound" : "inbound",
    internal: from ? isInternal(from) : m.direction === "outbound",
    from: personRef(from ?? "", m.fromName, cards),
    recipients: recips.map((r) => personRef(r.email, r.name, cards)),
    atLabel: fmt(m.sentAt ?? m.receivedAt ?? m.createdAt),
    bodyMain: main,
    bodyQuoted: quoted,
    flagged: m.flagged,
    attachments: m.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
      isImage: a.isImage,
      isPdf: a.contentType === "application/pdf",
      hasBlob: Boolean(a.blobUrl),
    })),
    replyTo,
    replyCc,
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function fmt(d: Date | null): string {
  if (!d) return "";
  // Render in Mountain Time (the vault's timezone); server runs in UTC, so
  // without this an email shows 6 hours ahead of when it actually arrived.
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Denver",
  });
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
