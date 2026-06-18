// Phase: classify a task into an OEM "type of request" so the Tasks table can
// be sorted by which team function/person to engage. There is no such field in
// the vault, so it is derived by keyword from the task text + account. Pure and
// unit-tested. The order of TYPES is the match precedence (first match wins).

export const TASK_TYPES = [
  "PCN",
  "Quality & Reg",
  "Pricing/Quote",
  "Samples/Dev",
  "Supply/Logistics",
  "Commercial",
  "Admin/Other",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

const RULES: { type: TaskType; re: RegExp }[] = [
  { type: "PCN", re: /\b(pcn|ecn|change notice|change order|gtin|udi|label change|eifu)\b/i },
  {
    type: "Quality & Reg",
    re: /\b(quality|capa|audit|spec|specification|validation|complaint|nonconform|ncr|deviation|regulat|fda|iso\s*13485|dhf|dmr|risk|ifu)\b/i,
  },
  {
    type: "Pricing/Quote",
    re: /\b(price|pricing|quote|quotation|\bpo\b|purchase order|contract|cost|discount|rebate|margin|terms)\b/i,
  },
  {
    type: "Samples/Dev",
    re: /\b(sample|prototype|proto|r&d|development|design|drawing|tooling|first article|\bfai\b|engineering|spec sheet|build)\b/i,
  },
  {
    type: "Supply/Logistics",
    re: /\b(ship|shipment|shipping|freight|logistic|lead time|inventory|stock|backorder|delivery|fulfil|expedite|allocation)\b/i,
  },
  {
    type: "Commercial",
    re: /\b(forecast|meeting|review|sync|call|follow[\s-]?up|relationship|qbr|proposal|opportunity|pipeline|renewal|kickoff)\b/i,
  },
];

export function classifyTaskType(
  title: string,
  description?: string,
): TaskType {
  const hay = `${title} ${description ?? ""}`;
  for (const r of RULES) {
    if (r.re.test(hay)) return r.type;
  }
  return "Admin/Other";
}
