import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

// Evidence corpus for the Main St. AI workflow discovery pass
// (POST /api/workflows/discover). Gathers a bounded, cheap read over the
// behavioral data the app already records, so ONE model() call can look for
// recurring end-to-end processes. Query discipline per the Neon egress rule
// (lib/firehose/read.ts's SCAN_COLUMNS comment): narrow column selects,
// bounded limits, and NEVER email body_text/body_html in bulk. Subjects,
// titles, names, pathways, and triage summaries are plenty of signal for v1.
//
// Sections gathered (each individually best-effort; a missing self-provisioned
// table yields an empty section, never a failure):
//   A. email_triage: pathway + one-line AI summary of recent threads (200)
//   B. recent inbound thread subjects + resolved account names (150)
//   C. delegated tasks: title + customer + delegate name (150)
//   D. completed-task lifecycles: task_updates sequences for 40 recent
//      completed tasks (created -> delegated -> email-linked -> done)
//   E. confirmed task<->email and task<->meeting links (100 each)

export interface WorkflowEvidenceCorpus {
  corpus: string;
  itemCount: number;
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

async function tryRows(query: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  try {
    return rowsOf(await getDb().execute(query));
  } catch {
    return []; // table not provisioned yet, or transient read failure
  }
}

function cleanSubject(s: unknown): string {
  return String(s ?? "")
    .replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CORPUS_CHAR_CAP = 24000;

export async function gatherWorkflowEvidence(): Promise<WorkflowEvidenceCorpus> {
  // A. Triage pathways + summaries. Noise is excluded: it never carries a
  // process worth mapping.
  const triage = await tryRows(sql`
    select pathway, summary
    from email_triage
    where pathway is not null and pathway <> 'noise' and summary is not null
    order by updated_at desc
    limit 200
  `);

  // B. Inbound thread subjects with account names. Narrow columns only.
  const subjects = await tryRows(sql`
    select e.subject, a.name as account
    from emails e
    left join accounts a on a.id = e.account_id
    where e.direction = 'inbound' and e.subject is not null
    order by e.id desc
    limit 150
  `);

  // C. Who Jordan delegates what kinds of work to.
  const delegated = await tryRows(sql`
    select t.text as title, t.customer, t.done, p.full_name as delegate
    from tasks t
    join people p on p.id = t.owner_person_id
    order by t.updated_at desc
    limit 150
  `);

  // D. What a completed task's lifecycle actually looked like: the update log
  // (manual notes, email-linked, meeting-linked, status changes) for recent
  // completed tasks, in order.
  const completedTasks = await tryRows(sql`
    select id, text as title, customer
    from tasks
    where done = true
    order by updated_at desc
    limit 40
  `);
  const completedIds = completedTasks
    .map((t) => Number(t.id))
    .filter(Number.isInteger);
  const updates = completedIds.length
    ? await tryRows(sql`
        select task_id, kind, text, created_at
        from task_updates
        where task_id = any(${completedIds})
        order by task_id, created_at asc
        limit 400
      `)
    : [];
  const updatesByTask = new Map<number, string[]>();
  for (const u of updates) {
    const tid = Number(u.task_id);
    const list = updatesByTask.get(tid) ?? [];
    if (list.length < 12) {
      list.push(`${String(u.kind)}: ${String(u.text ?? "").slice(0, 140)}`);
    }
    updatesByTask.set(tid, list);
  }

  // E. Confirmed links: which emails and meetings Jordan tied to which tasks.
  const emailLinks = await tryRows(sql`
    select t.text as task, e.subject
    from task_emails te
    join tasks t on t.id = te.task_id
    join emails e on e.id = te.email_id
    order by te.created_at desc
    limit 100
  `);
  const meetingLinks = await tryRows(sql`
    select t.text as task, m.title, m.date
    from task_meetings tm
    join tasks t on t.id = tm.task_id
    join meetings m on m.id = tm.meeting_id
    order by tm.created_at desc
    limit 100
  `);

  // ---- Assemble the labeled corpus ----------------------------------------
  const lines: string[] = [];
  let items = 0;

  lines.push("SECTION A: recent email threads by triage pathway (pathway | one-line summary)");
  for (const r of triage) {
    lines.push(`- ${String(r.pathway)} | ${String(r.summary ?? "").slice(0, 160)}`);
    items++;
  }

  lines.push("", "SECTION B: recent inbound email subjects (subject | account)");
  const seenSubjects = new Set<string>();
  for (const r of subjects) {
    const subj = cleanSubject(r.subject);
    if (!subj) continue;
    const key = subj.toLowerCase();
    if (seenSubjects.has(key)) continue; // one line per thread, not per message
    seenSubjects.add(key);
    lines.push(`- ${subj.slice(0, 120)} | ${String(r.account ?? "unknown account")}`);
    items++;
  }

  lines.push("", "SECTION C: tasks Jordan delegated (task title | customer | delegated to)");
  for (const r of delegated) {
    lines.push(
      `- ${String(r.title ?? "").slice(0, 140)} | ${String(r.customer ?? "internal")} | ${String(r.delegate ?? "")}${r.done ? " | completed" : ""}`,
    );
    items++;
  }

  lines.push("", "SECTION D: completed task lifecycles (title, then its update log in order)");
  for (const t of completedTasks) {
    const log = updatesByTask.get(Number(t.id)) ?? [];
    if (!log.length) continue;
    lines.push(`- TASK: ${String(t.title ?? "").slice(0, 140)} (${String(t.customer ?? "internal")})`);
    for (const entry of log) lines.push(`    ${entry}`);
    items++;
  }

  lines.push("", "SECTION E: confirmed links between tasks and emails/meetings");
  for (const r of emailLinks) {
    lines.push(
      `- task "${String(r.task ?? "").slice(0, 100)}" <-> email "${cleanSubject(r.subject).slice(0, 100)}"`,
    );
    items++;
  }
  for (const r of meetingLinks) {
    lines.push(
      `- task "${String(r.task ?? "").slice(0, 100)}" <-> meeting "${String(r.title ?? "").slice(0, 100)}"${r.date ? ` (${String(r.date)})` : ""}`,
    );
    items++;
  }

  return { corpus: lines.join("\n").slice(0, CORPUS_CHAR_CAP), itemCount: items };
}
