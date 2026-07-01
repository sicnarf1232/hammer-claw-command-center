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
import { suggestAccountForEmail } from "@/lib/firehose/senderSuggest";
import { aiConfigured } from "@/lib/ai";
import ThreadActions from "@/components/ThreadActions";
import TriageBar from "@/components/TriageBar";
import ReplyBox from "@/components/ReplyBox";
import SenderSuggest from "@/components/SenderSuggest";

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

  // Reply-all recipient set: everyone on the thread except Jordan. Primary "to"
  // is the last inbound sender; everyone else lands in Cc.
  const self = new Set<string>([JORDAN]);
  for (const m of messages) {
    if (m.direction === "outbound" && m.fromEmail) self.add(m.fromEmail.toLowerCase());
  }
  const everyone = new Set<string>();
  for (const m of messages) {
    if (m.fromEmail) everyone.add(m.fromEmail.toLowerCase());
    for (const r of m.recipients ?? []) if (r?.email) everyone.add(r.email.toLowerCase());
  }
  const primaryTo = latestInbound?.fromEmail?.toLowerCase() ?? null;
  const ccList = [...everyone].filter((a) => !self.has(a) && a !== primaryTo);
  const toList = primaryTo ? [primaryTo] : [];

  // Ensure this thread is triaged (one Haiku call when stale), then read it back.
  let triage: TriageRow | null = null;
  if (aiConfigured()) {
    await ensureTriageForKeys([decoded], 1).catch(() => {});
    triage = (await getTriageMap([decoded])).get(decoded) ?? null;
  }
  const path = triage?.pathway ? PATHWAY_META[triage.pathway] : null;

  // Smart Action panel: suggested related open tasks (account + keyword match).
  const suggestText = `${subject} ${triage?.summary ?? ""}`;
  const taskSuggestions = await suggestTasksForThread(acct?.name ?? null, suggestText, 3).catch(() => []);

  // Sender suggestion: only when the thread is not mapped to an account and has
  // an external inbound sender.
  let senderSuggestion: {
    address: string;
    name: string | null;
    suggestion: { accountId: number; name: string } | null;
  } | null = null;
  if (acctId == null && latestInbound?.fromEmail) {
    const s = await suggestAccountForEmail(latestInbound.fromEmail).catch(() => null);
    senderSuggestion = {
      address: latestInbound.fromEmail,
      name: latestInbound.fromName ?? null,
      suggestion: s ? { accountId: s.accountId, name: s.name } : null,
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
        <ThreadActions
          ids={messages.map((m) => m.id)}
          flagged={flagged}
          archived={archived}
        />
      </header>

      {senderSuggestion ? (
        <SenderSuggest
          address={senderSuggestion.address}
          name={senderSuggestion.name}
          suggestion={senderSuggestion.suggestion}
        />
      ) : null}

      {triage?.summary || taskSuggestions.length ? (
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

          {taskSuggestions.length ? (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <SparkGlyph />
                <span className="eyebrow text-accent">Suggested actions</span>
              </div>
              <ul className="space-y-2">
                {taskSuggestions.map((s, i) => (
                  <li key={i} className="text-sm">
                    <Link href="/tasks" className="font-medium text-fg hover:text-accent">
                      {s.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-2xs text-muted">
                      {s.customer ? <span>{s.customer}</span> : null}
                      {s.due ? <span>· due {s.due}</span> : null}
                      {s.priority ? <span>· {s.priority}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-muted">
                Suggested from your open tasks. It learns as you act.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <TriageBar
        threadKey={decoded}
        pathway={triage?.pathway ?? null}
        reviewed={Boolean(triage?.reviewed)}
      />

      <div className="grid gap-3">
        {messages.map((m) => (
          <MessageCard key={m.id} m={m} />
        ))}
      </div>

      {latestInbound ? (
        <ReplyBox
          replyToId={latestInbound.id}
          to={latestInbound.fromName?.trim() || latestInbound.fromEmail || "sender"}
          subject={subject}
          toList={toList}
          ccList={ccList}
        />
      ) : (
        <p className="mt-5 text-sm text-muted">
          This thread has no inbound message to reply to.
        </p>
      )}
    </div>
  );
}

function MessageCard({ m }: { m: ThreadMessage }) {
  const outbound = m.direction === "outbound";
  const body = bodyOf(m);
  return (
    <article className={`card p-4 ${outbound ? "border-l-2 border-l-accent2" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg">
            {m.fromName?.trim() || m.fromEmail || "Unknown"}
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-2xs font-medium ${
                outbound ? "bg-accentSoft text-accent2" : "bg-surface2 text-fg/60"
              }`}
            >
              {outbound ? "Sent" : "Received"}
            </span>
            {m.flagged ? <span className="ml-1" title="Flagged">🚩</span> : null}
          </div>
          {m.recipients && m.recipients.length > 0 ? (
            <div className="mt-0.5 truncate text-xs text-muted">
              to{" "}
              {m.recipients
                .filter((r) => r.role !== "from")
                .map((r) => r.name || r.email)
                .join(", ")}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-2xs tabular-nums text-muted">
          {fmt(m.sentAt ?? m.receivedAt ?? m.createdAt)}
        </div>
      </div>

      {body ? (
        <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg/85">
          {body}
        </div>
      ) : (
        <div className="mt-3 text-sm italic text-muted">(no text body)</div>
      )}

      {m.attachments.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {m.attachments.map((a) => (
            <a
              key={a.id}
              href={`/api/email-attachments/file?id=${a.id}${
                a.isImage || a.contentType === "application/pdf" ? "" : "&download=1"
              }`}
              target="_blank"
              rel="noreferrer"
              className={`chip border-border ${
                a.blobUrl ? "text-fg/75 hover:text-accent" : "cursor-default text-fg/40"
              }`}
              title={a.blobUrl ? "Open attachment" : "Not retained"}
            >
              {a.isImage ? "🖼 " : "📎 "}
              {a.fileName || "attachment"}
              {a.sizeBytes ? ` · ${kb(a.sizeBytes)}` : ""}
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function bodyOf(m: ThreadMessage): string {
  if (m.bodyText?.trim()) return collapse(m.bodyText);
  if (m.bodyHtml?.trim()) {
    return collapse(
      m.bodyHtml
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<head[\s\S]*?<\/head>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">"),
    );
  }
  return m.bodyPreview?.trim() || "";
}

function collapse(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function kb(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SparkGlyph() {
  return (
    <svg className="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.6a2 2 0 0 0 1.3 1.3L21 11l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 11l5.8-1.9a2 2 0 0 0 1.3-1.3z" />
    </svg>
  );
}
