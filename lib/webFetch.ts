// External page fetching for the inbox brain's fetch_url tool: Jordan asks
// it to check a website (his own site, a supplier page, a spec sheet URL)
// and it reads the page as text. Public http/https only; anything that could
// reach internal services is refused. Fetched content is UNTRUSTED and must
// be wrapped in <untrusted_content> by the caller.

const MAX_CHARS = 12000;
const TIMEOUT_MS = 10000;

// Hostnames and address shapes that must never be fetched server-side.
export function isSafeExternalUrl(raw: string): { ok: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed." };
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return { ok: false, reason: "Local hosts are not allowed." };
  }
  // IPv6 literals and anything bracketed: refuse outright.
  if (host.includes(":") || raw.includes("[")) {
    return { ok: false, reason: "IP literal hosts are not allowed." };
  }
  // IPv4 literals: refuse private, loopback, link-local, and metadata ranges;
  // simplest safe rule is to refuse ALL bare IPv4 hosts.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { ok: false, reason: "IP literal hosts are not allowed." };
  }
  return { ok: true };
}

// Strip an HTML document down to readable text. Pure, capped, testable.
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style|noscript|svg|head)\b[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchExternalPage(rawUrl: string): Promise<string> {
  const safe = isSafeExternalUrl(rawUrl);
  if (!safe.ok) return `Refused to fetch: ${safe.reason}`;
  try {
    const res = await fetch(rawUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "User-Agent": "HammerClawBrain/1.0 (single-user assistant fetch)",
        Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5",
      },
    });
    if (!res.ok) return `Fetch failed: HTTP ${res.status} from ${rawUrl}.`;
    const type = res.headers.get("content-type") ?? "";
    if (
      !type.includes("text/") &&
      !type.includes("json") &&
      !type.includes("xml") &&
      type !== ""
    ) {
      return `Fetched ${rawUrl} but it is ${type}, not a readable page.`;
    }
    const raw = await res.text();
    const text = type.includes("html") ? htmlToText(raw) : raw;
    const clipped = text.slice(0, MAX_CHARS);
    return clipped.length
      ? `Content of ${res.url}:\n\n${clipped}${text.length > MAX_CHARS ? "\n\n[truncated]" : ""}`
      : `Fetched ${res.url} but found no readable text.`;
  } catch (e) {
    return `Fetch failed: ${e instanceof Error ? e.message : "network error"}.`;
  }
}
