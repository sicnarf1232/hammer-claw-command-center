// The agent roster: every AI worker in the app, its blast radius, and the
// gate it must clear to climb the trust ladder (docs/AGENTIC-TRIAGE.md).
// Levels: shadow -> observer -> proposer -> delegate. Promotion is always
// Jordan's explicit act; the gate only says when he may be asked.

export type AgentKey =
  | "triage"
  | "drafter"
  | "task-extractor"
  | "brief-writer"
  | "import-mapper";

export type AgentLevel = "shadow" | "observer" | "proposer" | "delegate";
export type BlastRadius = "reversible" | "outward-facing" | "read-only";
export type ModelChoice = "default" | "smart" | "fast" | "ab";

export interface AgentDef {
  key: AgentKey;
  name: string;
  description: string;
  blast: BlastRadius;
  // The next-gate definition: minimum decisions at or above the agreement
  // threshold within the window unlocks a promotion prompt.
  gate: { toLevel: AgentLevel; decisions: number; agreementPct: number };
  // Where this agent's work is instrumented today. Uninstrumented agents sit
  // in shadow with honest zeros until their pipelines log verdicts.
  instrumented: boolean;
}

export const LEVEL_LABEL: Record<AgentLevel, string> = {
  shadow: "Shadow",
  observer: "Observer",
  proposer: "Proposer",
  delegate: "Delegate",
};

export const LEVEL_ORDER: AgentLevel[] = ["shadow", "observer", "proposer", "delegate"];

export const AGENTS: AgentDef[] = [
  {
    key: "triage",
    name: "Triage",
    description: "Labels every inbox thread with a pathway and urgency level",
    blast: "reversible",
    gate: { toLevel: "delegate", decisions: 50, agreementPct: 95 },
    instrumented: true,
  },
  {
    key: "drafter",
    name: "Drafter",
    description: "Proposes reply drafts for threads flagged needs-reply",
    blast: "outward-facing",
    gate: { toLevel: "proposer", decisions: 100, agreementPct: 92 },
    instrumented: false,
  },
  {
    key: "task-extractor",
    name: "Task Extractor",
    description: "Extracts commitments from threads and Granola meeting notes",
    blast: "reversible",
    gate: { toLevel: "proposer", decisions: 30, agreementPct: 90 },
    instrumented: true, // via ai_proposals (meeting files + series updates)
  },
  {
    key: "brief-writer",
    name: "Brief Writer",
    description: "Morning and evening briefs from the app's live context",
    blast: "read-only",
    gate: { toLevel: "delegate", decisions: 20, agreementPct: 88 },
    instrumented: true, // volume only; usefulness ratings not collected yet
  },
  {
    key: "import-mapper",
    name: "Import Mapper",
    description: "Proposes column mappings for price list imports",
    blast: "reversible",
    gate: { toLevel: "proposer", decisions: 10, agreementPct: 80 },
    instrumented: true, // via import_batches + saved rulesets
  },
];

// Rough per-call cost estimates by model family, for the roster's weekly
// cost line. Labeled "est." in the UI; we do not meter tokens yet.
export function estCostPerItem(model: string | null): number {
  if (!model) return 0.002;
  if (model.startsWith("claude-opus")) return 0.05;
  if (model.startsWith("claude-sonnet")) return 0.012;
  if (model.startsWith("claude-haiku")) return 0.002;
  return 0.005;
}
