import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { AgentKey, ModelChoice } from "./registry";

// Per-agent knobs Jordan can turn in the app: on/off, and which of the two
// configured runtime models the agent runs on. "ab" alternates between them
// deterministically per item so agreement can be compared per model. Never
// an arbitrary model id.

export interface AgentSettings {
  enabled: boolean;
  modelChoice: ModelChoice;
}

const DEFAULTS: AgentSettings = { enabled: true, modelChoice: "default" };

let provisioned = false;
async function ensure(): Promise<void> {
  if (provisioned) return;
  await getDb().execute(sql`
    create table if not exists agent_settings (
      agent text primary key,
      enabled boolean not null default true,
      model_choice text not null default 'default',
      updated_at timestamptz not null default now()
    )
  `);
  provisioned = true;
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

export async function getAgentSettings(): Promise<Map<AgentKey, AgentSettings>> {
  const out = new Map<AgentKey, AgentSettings>();
  try {
    await ensure();
    const rows = rowsOf(await getDb().execute(sql`select * from agent_settings`));
    for (const r of rows) {
      out.set(String(r.agent) as AgentKey, {
        enabled: Boolean(r.enabled),
        modelChoice: (String(r.model_choice) as ModelChoice) ?? "default",
      });
    }
  } catch {
    /* table unavailable: defaults apply */
  }
  return out;
}

export async function getAgentSetting(agent: AgentKey): Promise<AgentSettings> {
  return (await getAgentSettings()).get(agent) ?? DEFAULTS;
}

export async function setAgentSetting(
  agent: AgentKey,
  patch: Partial<AgentSettings>,
): Promise<void> {
  await ensure();
  const current = (await getAgentSettings()).get(agent) ?? DEFAULTS;
  const next = { ...current, ...patch };
  await getDb().execute(sql`
    insert into agent_settings (agent, enabled, model_choice, updated_at)
    values (${agent}, ${next.enabled}, ${next.modelChoice}, now())
    on conflict (agent) do update
      set enabled = excluded.enabled,
          model_choice = excluded.model_choice,
          updated_at = now()
  `);
}

// Resolve the effective model for one item. "ab" alternates by a stable hash
// of the item key so re-runs stay on the same side of the test.
export function resolveModelChoice(
  choice: ModelChoice,
  itemKey: string,
): "smart" | "fast" | undefined {
  if (choice === "smart" || choice === "fast") return choice;
  if (choice === "ab") {
    let h = 0;
    for (let i = 0; i < itemKey.length; i++) h = (h * 31 + itemKey.charCodeAt(i)) | 0;
    return Math.abs(h) % 2 === 0 ? "smart" : "fast";
  }
  return undefined; // default: the call site's existing model
}
