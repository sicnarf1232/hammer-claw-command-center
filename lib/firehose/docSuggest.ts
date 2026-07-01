import { listDocuments, matchDocuments } from "@/lib/documents";

// Suggest-attach: when viewing/replying to a thread, surface documents from the
// library that are relevant to it (by topic keywords, boosted for the same
// account) so a reply can reference or attach the right spec/cert/quote. Pure
// ranking over the existing library; degrades to [] when no library/DB.

export interface DocSuggestion {
  id: number;
  title: string;
  fileName: string;
  docType: string;
  account: string | null;
  contentType: string | null;
}

export async function suggestDocsForThread(
  accountName: string | null,
  text: string,
  limit = 3,
): Promise<DocSuggestion[]> {
  let docs;
  try {
    docs = await listDocuments();
  } catch {
    return [];
  }
  if (!docs.length) return [];

  // Keyword match over title/account/type/tags/extracted text, taking extra
  // candidates so the same-account boost below can reorder before we trim.
  const ranked = matchDocuments(text, docs, limit * 3);
  const acct = accountName?.trim().toLowerCase() ?? "";

  const scored = ranked.map((d, i) => {
    const sameAccount = acct && (d.account ?? "").trim().toLowerCase() === acct;
    // Preserve keyword rank (earlier = better) and lift same-account matches.
    return { d, rank: i - (sameAccount ? 1000 : 0) };
  });

  return scored
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ d }) => ({
      id: d.id,
      title: d.title,
      fileName: d.fileName,
      docType: d.docType,
      account: d.account,
      contentType: d.contentType,
    }));
}
