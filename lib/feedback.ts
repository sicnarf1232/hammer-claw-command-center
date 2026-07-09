import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

// Two feedback buckets, both written by Jordan while using the app:
// - agent_feedback: verdicts from the /agents review queue, with his optional
//   justification. This is the contextual training record for the agents.
// - dev_feedback: quick app improvement notes captured anywhere via the
//   brain's /devfeedback command, drained later during build sessions.

let provisioned = false;
async function ensure(): Promise<void> {
  if (provisioned) return;
  const db = getDb();
  await db.execute(sql`
    create table if not exists agent_feedback (
      id serial primary key,
      agent text not null,
      item_key text,
      verdict text not null,
      proposed text,
      corrected text,
      note text,
      created_at timestamptz not null default now()
    )
  `);
  await db.execute(sql`
    create table if not exists dev_feedback (
      id serial primary key,
      text text not null,
      page text,
      status text not null default 'open',
      created_at timestamptz not null default now()
    )
  `);
  provisioned = true;
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

export async function addAgentFeedback(input: {
  agent: string;
  itemKey: string | null;
  verdict: "approved" | "edited" | "rejected";
  proposed: string | null;
  corrected: string | null;
  note: string | null;
}): Promise<void> {
  await ensure();
  await getDb().execute(sql`
    insert into agent_feedback (agent, item_key, verdict, proposed, corrected, note)
    values (${input.agent}, ${input.itemKey}, ${input.verdict}, ${input.proposed},
            ${input.corrected}, ${input.note})
  `);
}

export async function addDevFeedback(text: string, page: string | null): Promise<number> {
  await ensure();
  const rows = rowsOf(
    await getDb().execute(sql`
      insert into dev_feedback (text, page) values (${text}, ${page}) returning id
    `),
  );
  return Number(rows[0]?.id ?? 0);
}

export interface DevFeedbackItem {
  id: number;
  text: string;
  page: string | null;
  status: string;
  createdAtISO: string | null;
}

export async function listDevFeedback(status?: string): Promise<DevFeedbackItem[]> {
  await ensure();
  const rows = rowsOf(
    await getDb().execute(
      status
        ? sql`select * from dev_feedback where status = ${status} order by id desc limit 200`
        : sql`select * from dev_feedback order by id desc limit 200`,
    ),
  );
  return rows.map((r) => ({
    id: Number(r.id),
    text: String(r.text),
    page: r.page ? String(r.page) : null,
    status: String(r.status),
    createdAtISO: r.created_at ? new Date(String(r.created_at)).toISOString() : null,
  }));
}

export async function setDevFeedbackStatus(id: number, status: "open" | "done"): Promise<void> {
  await ensure();
  await getDb().execute(sql`update dev_feedback set status = ${status} where id = ${id}`);
}
