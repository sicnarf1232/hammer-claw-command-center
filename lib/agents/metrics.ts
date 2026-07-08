import { sql } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";
import { AGENTS, estCostPerItem, type AgentKey, type AgentLevel } from "./registry";
import { getAgentSettings, type AgentSettings } from "./settings";

// Everything the /agents page needs, computed from the data the app already
// records: email_triage (manual corrections vs ai_snapshot originals),
// ai_proposals, import_batches, and stored briefs. No new write paths; this
// file only reads. Where a pipeline is not instrumented yet the numbers stay
// honest zeros instead of inventions.

export type Verdict = "approved" | "edited" | "rejected" | "pending" | "auto";

export interface AgentStats {
  key: AgentKey;
  level: AgentLevel;
  settings: AgentSettings;
  volume7d: number;
  agreementPct: number | null; // null = no decisions yet
  decisions: number; // graded decisions counted toward the gate
  estCostWeek: number;
  errorRate: number | null;
  lastActiveISO: string | null;
  streak: string | null;
  last20: Verdict[];
  modelMix: Array<{ model: string; count: number; agreementPct: number | null }>;
}

export interface ReviewItem {
  id: string; // "triage:<threadKey>" | "proposal:<id>"
  agent: AgentKey;
  kind: string;
  blast: string;
  title: string;
  detail: string;
  proposed: string; // the call being judged (pathway or proposal summary)
  threadKey: string | null;
  confidence: number | null;
  atISO: string | null;
}

export interface LedgerRow {
  atISO: string | null;
  agent: AgentKey;
  action: string;
  threadKey: string | null;
  blast: string;
  model: string | null;
  verdict: Verdict;
}

export interface AgentsData {
  agents: AgentStats[];
  review: ReviewItem[];
  ledger: LedgerRow[];
  week: { items: number; drafts: number; estCost: number };
}

// Current level per agent until promotions are stored (the ladder UI reads
// this; promotion flow is the Stage 2 build).
const CURRENT_LEVEL: Record<AgentKey, AgentLevel> = {
  triage: "proposer",
  drafter: "observer",
  "task-extractor": "observer",
  "brief-writer": "proposer",
  "import-mapper": "shadow",
};

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function gatherAgentsData(): Promise<AgentsData> {
  if (!dbConfigured()) {
    return { agents: [], review: [], ledger: [], week: { items: 0, drafts: 0, estCost: 0 } };
  }
  const db = getDb();
  const settings = await getAgentSettings();

  // ---- Triage: the fully instrumented agent -------------------------------
  let triageRows: Record<string, unknown>[] = [];
  try {
    triageRows = rowsOf(
      await db.execute(sql`
        select thread_key, pathway, priority, model, updated_at, reviewed,
               reviewed_at, manual, ai_generated, ai_snapshot, summary
        from email_triage
        where pathway is not null
        order by updated_at desc
        limit 400
      `),
    );
  } catch {
    /* not provisioned */
  }

  const weekAgo = Date.now() - 7 * 86400000;
  const graded: Array<{ at: Date; verdict: Verdict; model: string | null }> = [];
  let triageVol7d = 0;
  const modelAgg = new Map<string, { count: number; agree: number; graded: number }>();
  let pendingTriage: Record<string, unknown>[] = [];
  let noiseStreak = 0;
  let noiseStreakBroken = false;

  for (const r of triageRows) {
    const at = r.updated_at ? new Date(String(r.updated_at)) : null;
    const model = r.model ? String(r.model) : null;
    if (at && at.getTime() > weekAgo) {
      triageVol7d++;
      if (model) {
        const m = modelAgg.get(model) ?? { count: 0, agree: 0, graded: 0 };
        m.count++;
        modelAgg.set(model, m);
      }
    }
    const snapshot = (r.ai_snapshot ?? null) as { pathway?: string } | null;
    const manual = Boolean(r.manual);
    const reviewed = Boolean(r.reviewed);
    if (manual && snapshot?.pathway) {
      const agreedCall = snapshot.pathway === String(r.pathway);
      graded.push({ at: at ?? new Date(0), verdict: agreedCall ? "approved" : "edited", model });
      if (model) {
        const m = modelAgg.get(model) ?? { count: 0, agree: 0, graded: 0 };
        m.graded++;
        if (agreedCall) m.agree++;
        modelAgg.set(model, m);
      }
    } else if (reviewed && !manual) {
      // Reviewed without correcting the label = implicit approval.
      graded.push({ at: at ?? new Date(0), verdict: "approved", model });
      if (model) {
        const m = modelAgg.get(model) ?? { count: 0, agree: 0, graded: 0 };
        m.graded++;
        m.agree++;
        modelAgg.set(model, m);
      }
    } else if (Boolean(r.ai_generated) && !reviewed && !manual) {
      pendingTriage.push(r);
    }
    // Streak: consecutive newest noise calls not corrected.
    if (!noiseStreakBroken && String(r.pathway) === "noise") {
      if (manual && snapshot?.pathway && snapshot.pathway !== "noise") noiseStreakBroken = true;
      else noiseStreak++;
    }
  }
  pendingTriage = pendingTriage.slice(0, 8);

  const triageGraded = graded.length;
  const triageAgree = graded.filter((g) => g.verdict === "approved").length;
  const triageStats: AgentStats = {
    key: "triage",
    level: CURRENT_LEVEL.triage,
    settings: settings.get("triage") ?? { enabled: true, modelChoice: "default" },
    volume7d: triageVol7d,
    agreementPct: triageGraded ? Math.round((triageAgree / triageGraded) * 100) : null,
    decisions: triageGraded,
    estCostWeek: [...modelAgg.entries()].reduce(
      (s, [m, v]) => s + v.count * estCostPerItem(m),
      0,
    ),
    errorRate: null,
    lastActiveISO: iso(triageRows[0]?.updated_at),
    streak: noiseStreak >= 5 ? `${noiseStreak} straight Noise calls agreed` : null,
    last20: graded.slice(0, 20).map((g) => g.verdict),
    modelMix: [...modelAgg.entries()].map(([model, v]) => ({
      model,
      count: v.count,
      agreementPct: v.graded ? Math.round((v.agree / v.graded) * 100) : null,
    })),
  };

  // ---- Task extractor: ai_proposals --------------------------------------
  let proposalRows: Record<string, unknown>[] = [];
  try {
    proposalRows = rowsOf(
      await db.execute(sql`
        select id, kind, summary, status, model, created_at, decided_at
        from ai_proposals
        order by created_at desc
        limit 100
      `),
    );
  } catch {
    /* not provisioned */
  }
  const propDecided = proposalRows.filter(
    (p) => p.status === "approved" || p.status === "rejected",
  );
  const propApproved = propDecided.filter((p) => p.status === "approved").length;
  const propPending = proposalRows.filter((p) => p.status === "pending");
  const prop7d = proposalRows.filter(
    (p) => p.created_at && new Date(String(p.created_at)).getTime() > weekAgo,
  ).length;
  const extractorStats: AgentStats = {
    key: "task-extractor",
    level: CURRENT_LEVEL["task-extractor"],
    settings: settings.get("task-extractor") ?? { enabled: true, modelChoice: "default" },
    volume7d: prop7d,
    agreementPct: propDecided.length
      ? Math.round((propApproved / propDecided.length) * 100)
      : null,
    decisions: propDecided.length,
    estCostWeek: prop7d * estCostPerItem("claude-sonnet"),
    errorRate: null,
    lastActiveISO: iso(proposalRows[0]?.created_at),
    streak: null,
    last20: propDecided
      .slice(0, 20)
      .map((p) => (p.status === "approved" ? "approved" : "rejected") as Verdict),
    modelMix: [],
  };

  // ---- Brief writer: stored briefs ----------------------------------------
  let briefRows: Record<string, unknown>[] = [];
  try {
    briefRows = rowsOf(
      await db.execute(sql`
        select key, updated_at from app_settings
        where key like 'brief:%'
        order by updated_at desc
        limit 30
      `),
    );
  } catch {
    /* fine */
  }
  const briefStats: AgentStats = {
    key: "brief-writer",
    level: CURRENT_LEVEL["brief-writer"],
    settings: settings.get("brief-writer") ?? { enabled: true, modelChoice: "default" },
    volume7d: briefRows.filter(
      (b) => b.updated_at && new Date(String(b.updated_at)).getTime() > weekAgo,
    ).length,
    agreementPct: null, // usefulness ratings not collected yet
    decisions: 0,
    estCostWeek:
      briefRows.filter(
        (b) => b.updated_at && new Date(String(b.updated_at)).getTime() > weekAgo,
      ).length * estCostPerItem("claude-opus"),
    errorRate: null,
    lastActiveISO: iso(briefRows[0]?.updated_at),
    streak: null,
    last20: [],
    modelMix: [],
  };

  // ---- Import mapper: batches + rulesets ----------------------------------
  let batchRows: Record<string, unknown>[] = [];
  try {
    batchRows = rowsOf(
      await db.execute(sql`
        select id, file_name, inserted, skipped, created_at
        from import_batches order by created_at desc limit 20
      `),
    );
  } catch {
    /* fine */
  }
  const mapperStats: AgentStats = {
    key: "import-mapper",
    level: CURRENT_LEVEL["import-mapper"],
    settings: settings.get("import-mapper") ?? { enabled: true, modelChoice: "default" },
    volume7d: batchRows.filter(
      (b) => b.created_at && new Date(String(b.created_at)).getTime() > weekAgo,
    ).length,
    agreementPct: null,
    decisions: batchRows.length,
    estCostWeek: 0,
    errorRate: null,
    lastActiveISO: iso(batchRows[0]?.created_at),
    streak: null,
    last20: [],
    modelMix: [],
  };

  // ---- Drafter: not instrumented yet --------------------------------------
  const drafterStats: AgentStats = {
    key: "drafter",
    level: CURRENT_LEVEL.drafter,
    settings: settings.get("drafter") ?? { enabled: true, modelChoice: "default" },
    volume7d: 0,
    agreementPct: null,
    decisions: 0,
    estCostWeek: 0,
    errorRate: null,
    lastActiveISO: null,
    streak: null,
    last20: [],
    modelMix: [],
  };

  // ---- Review queue --------------------------------------------------------
  const review: ReviewItem[] = [];
  const keys = pendingTriage.map((r) => String(r.thread_key));
  const heads = await threadHeads(keys);
  for (const r of pendingTriage) {
    const key = String(r.thread_key);
    const head = heads.get(key);
    review.push({
      id: `triage:${key}`,
      agent: "triage",
      kind: "Triage call",
      blast: "Reversible",
      title: head?.subject ?? String(r.summary ?? key),
      detail: head?.from ?? "",
      proposed: String(r.pathway),
      threadKey: key,
      confidence: null,
      atISO: iso(r.updated_at),
    });
  }
  for (const p of propPending.slice(0, 8)) {
    review.push({
      id: `proposal:${p.id}`,
      agent: "task-extractor",
      kind: p.kind === "series-update" ? "Series update" : "Meeting file",
      blast: "Reversible",
      title: String(p.summary ?? `Proposal #${p.id}`),
      detail: "",
      proposed: String(p.kind),
      threadKey: null,
      confidence: null,
      atISO: iso(p.created_at),
    });
  }

  // ---- Ledger ---------------------------------------------------------------
  const ledger: LedgerRow[] = [];
  for (const r of triageRows.slice(0, 40)) {
    const snapshot = (r.ai_snapshot ?? null) as { pathway?: string } | null;
    const manual = Boolean(r.manual);
    const reviewed = Boolean(r.reviewed);
    const verdict: Verdict = manual
      ? snapshot?.pathway && snapshot.pathway !== String(r.pathway)
        ? "edited"
        : "approved"
      : reviewed
        ? "approved"
        : "pending";
    ledger.push({
      atISO: iso(r.updated_at),
      agent: "triage",
      action: `Labeled '${r.pathway}'${r.priority === "high" ? " + flagged high urgency" : ""}`,
      threadKey: String(r.thread_key),
      blast: "Reversible",
      model: r.model ? String(r.model) : null,
      verdict,
    });
  }
  for (const p of proposalRows.slice(0, 20)) {
    ledger.push({
      atISO: iso(p.decided_at ?? p.created_at),
      agent: "task-extractor",
      action: `Proposed: ${String(p.summary ?? p.kind)}`,
      threadKey: null,
      blast: "Reversible",
      model: p.model ? String(p.model) : null,
      verdict:
        p.status === "approved"
          ? "approved"
          : p.status === "rejected"
            ? "rejected"
            : "pending",
    });
  }
  for (const b of briefRows.slice(0, 7)) {
    ledger.push({
      atISO: iso(b.updated_at),
      agent: "brief-writer",
      action: `Brief generated (${String(b.key).replace("brief:", "")})`,
      threadKey: null,
      blast: "Read-only",
      model: null,
      verdict: "auto",
    });
  }
  for (const b of batchRows.slice(0, 10)) {
    ledger.push({
      atISO: iso(b.created_at),
      agent: "import-mapper",
      action: `Import committed: ${String(b.file_name ?? "price list")} (${b.inserted} rows, ${b.skipped} skipped)`,
      threadKey: null,
      blast: "Reversible",
      model: null,
      verdict: "approved",
    });
  }
  ledger.sort(
    (a, b) => new Date(b.atISO ?? 0).getTime() - new Date(a.atISO ?? 0).getTime(),
  );

  const agents = [triageStats, drafterStats, extractorStats, briefStats, mapperStats];
  // Keep registry order.
  agents.sort(
    (a, b) =>
      AGENTS.findIndex((d) => d.key === a.key) - AGENTS.findIndex((d) => d.key === b.key),
  );

  return {
    agents,
    review,
    ledger: ledger.slice(0, 60),
    week: {
      items: triageVol7d + prop7d + briefStats.volume7d + mapperStats.volume7d,
      drafts: 0,
      estCost: agents.reduce((s, a) => s + a.estCostWeek, 0),
    },
  };
}

// Subject + sender for a set of thread keys, for the review queue cards.
async function threadHeads(
  keys: string[],
): Promise<Map<string, { subject: string; from: string }>> {
  const out = new Map<string, { subject: string; from: string }>();
  const tids = keys.filter((k) => k.startsWith("t:")).map((k) => k.slice(2));
  const mids = keys
    .filter((k) => k.startsWith("m:"))
    .map((k) => Number(k.slice(2)))
    .filter(Number.isInteger);
  if (!tids.length && !mids.length) return out;
  try {
    const rows = rowsOf(
      await getDb().execute(sql`
        select id, thread_id, subject, from_name, from_email,
               coalesce(sent_at, received_at, created_at) as at
        from emails
        where ${tids.length ? sql`thread_id = any(${tids})` : sql`false`}
           or ${mids.length ? sql`id = any(${mids})` : sql`false`}
        order by coalesce(sent_at, received_at, created_at) desc
      `),
    );
    for (const r of rows) {
      const key = r.thread_id ? `t:${r.thread_id}` : `m:${r.id}`;
      if (!out.has(key)) {
        out.set(key, {
          subject: String(r.subject ?? "(no subject)"),
          from: String(r.from_name ?? r.from_email ?? ""),
        });
      }
    }
  } catch {
    /* fine */
  }
  return out;
}
