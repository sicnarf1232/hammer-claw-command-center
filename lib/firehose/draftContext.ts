import { listDocuments, matchDocuments, type DocumentRecord } from "@/lib/documents";
import { retrieveEmails } from "./brainSource";
import type { QuoteSpec } from "@/lib/quote/types";

// Brain context for AI drafting. When Jordan drafts a reply or a new email, pull
// the real facts he'd otherwise look up by hand: part numbers + pricing + lead
// times from saved quotes, relevant library documents, and related prior email.
// The draft prompt grounds on this so it can answer "what's the price on PN X"
// with the actual number instead of a placeholder. Best-effort; empty on error.

export async function retrieveDraftContext(
  text: string,
  accountName: string | null,
  opts: { docs?: number } = {},
): Promise<string> {
  const parts: string[] = [];
  const lowerText = text.toLowerCase();
  const acct = accountName?.trim().toLowerCase() ?? "";

  let docs: DocumentRecord[] = [];
  try {
    docs = await listDocuments();
  } catch {
    docs = [];
  }

  // Pricing / part numbers from saved quotes: include a line when its part number
  // is mentioned in the thread, or the quote belongs to this account.
  const priceLines: string[] = [];
  for (const d of docs) {
    if (d.docType !== "quote" || !d.spec) continue;
    const spec = d.spec as QuoteSpec;
    const acctMatch = acct !== "" && (d.account ?? "").trim().toLowerCase() === acct;
    for (const li of spec.lineItems ?? []) {
      const pn = (li.partNo ?? "").trim();
      const pnMentioned = pn.length >= 3 && lowerText.includes(pn.toLowerCase());
      if (!pnMentioned && !acctMatch) continue;
      const bits = [
        pn ? `PN ${pn}` : null,
        li.title || null,
        li.price ? `price ${li.price}` : null,
        li.leadTime ? `lead ${li.leadTime}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      if (bits) priceLines.push(`- ${bits}${d.account ? ` (${d.account})` : ""}`);
    }
  }
  const uniquePrice = Array.from(new Set(priceLines)).slice(0, 10);
  if (uniquePrice.length) {
    parts.push("Part numbers, pricing, and lead times on record:\n" + uniquePrice.join("\n"));
  }

  // Relevant non-quote reference documents (specs, certs, PCNs).
  const refDocs = matchDocuments(text, docs, opts.docs ?? 3).filter((d) => d.docType !== "quote");
  if (refDocs.length) {
    parts.push(
      "Relevant documents in the library (available to attach):\n" +
        refDocs.map((d) => `- ${d.title}${d.account ? ` (${d.account})` : ""}`).join("\n"),
    );
  }

  // Related prior email from the brain.
  let priorEmails: Awaited<ReturnType<typeof retrieveEmails>> = [];
  try {
    priorEmails = await retrieveEmails(text, 2);
  } catch {
    priorEmails = [];
  }
  if (priorEmails.length) {
    parts.push(
      "Related prior email:\n" +
        priorEmails.map((e) => `- ${e.title}: ${e.snippet.slice(0, 200)}`).join("\n"),
    );
  }

  return parts.join("\n\n").slice(0, 6000);
}
