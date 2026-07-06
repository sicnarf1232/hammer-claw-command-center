import { listDocuments, matchDocuments, type DocumentRecord } from "@/lib/documents";

// Cross-customer playbook: when handling a quality/PCN or quote thread, surface
// how the same kind of thing was handled for OTHER accounts, referencing the
// document library. It answers "have we done this before, and what did we send?"

export interface PlaybookItem {
  id: number;
  title: string;
  account: string | null;
  docType: string;
}

export interface Playbook {
  pathway: "quality-pcn" | "quote-request";
  items: PlaybookItem[];
}

// Doc types that count as prior work for each pathway.
const RELEVANT: Record<string, string[]> = {
  "quality-pcn": ["pcn", "cert", "iso", "biocomp", "spec"],
  "quote-request": ["quote"],
};

export async function crossCustomerPlaybook(
  pathway: string | null | undefined,
  accountName: string | null,
  text: string,
  limit = 4,
): Promise<Playbook | null> {
  if (pathway !== "quality-pcn" && pathway !== "quote-request") return null;

  let docs: DocumentRecord[];
  try {
    docs = await listDocuments();
  } catch {
    return null;
  }
  if (!docs.length) return null;

  const acct = accountName?.trim().toLowerCase() ?? "";
  const relevantTypes = new Set(RELEVANT[pathway]);

  // Prior work from OTHER accounts only, of a relevant doc type.
  const others = docs.filter(
    (d) => relevantTypes.has(d.docType) && (d.account ?? "").trim().toLowerCase() !== acct,
  );
  if (!others.length) return null;

  // Rank by topic match, but keep any relevant doc even without a keyword hit so
  // the panel still shows precedent for a brand-new topic.
  const matched = matchDocuments(text, others, limit * 2);
  const pool = matched.length ? matched : others;

  const items = pool.slice(0, limit).map((d) => ({
    id: d.id,
    title: d.title,
    account: d.account,
    docType: d.docType,
  }));

  return { pathway, items };
}
