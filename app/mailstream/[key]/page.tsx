import Link from "next/link";
import { notFound } from "next/navigation";
import { getThread, accountNames, type ThreadMessage } from "@/lib/firehose/read";

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

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/mailstream" className="text-xs text-muted hover:text-fg">
        ← Mailstream
      </Link>
      <header className="mb-5 mt-2">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{subject}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <span className="tabular-nums">{messages.length} messages</span>
          {acct ? (
            <Link href={`/accounts/${acct.slug}`} className="chip border-border text-fg/75">
              {acct.name}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-3">
        {messages.map((m) => (
          <MessageCard key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}

function MessageCard({ m }: { m: ThreadMessage }) {
  const outbound = m.direction === "outbound";
  const body = bodyOf(m);
  return (
    <article
      className={`card p-4 ${outbound ? "border-l-2 border-l-accent2" : ""}`}
    >
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
          </div>
          {m.recipients && m.recipients.length > 0 ? (
            <div className="mt-0.5 truncate text-xs text-muted">
              to {m.recipients.filter((r) => r.role !== "from").map((r) => r.name || r.email).join(", ")}
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

// Prefer plain text; fall back to stripped HTML so the chain stays readable
// without rendering untrusted email markup.
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
