import { writeFile, isVaultConfigured } from "@/lib/github";
import { getOpenTasks, getMeetingsIndex } from "@/lib/vault";
import { getTodayTasks } from "@/lib/today";
import { generateBrief, aiConfigured } from "@/lib/ai";
import { createNotification } from "@/lib/notify";
import { todayISO } from "@/lib/dates";
import { cutoverActive } from "@/lib/dbSource";
import { setSetting } from "@/lib/settings";
import type { Task } from "@/lib/vault/types";

export type BriefKind = "morning" | "eod" | "weekly";

const META = {
  morning: { label: "Morning Brief", folder: "100 Periodics/Daily", type: "daily", slug: "morning-brief" },
  eod: { label: "End of Day Recap", folder: "100 Periodics/Daily", type: "daily", slug: "eod-recap" },
  weekly: { label: "Weekly Review", folder: "100 Periodics/Weekly", type: "weekly", slug: "weekly-review" },
} as const;

function taskLine(t: Task): string {
  const bits: string[] = [`- ${t.title}`];
  const tags: string[] = [];
  if (t.customer && t.customer !== "internal") tags.push(t.customer.display);
  if (t.due) tags.push(`due ${t.due}`);
  if (t.priority) tags.push(t.priority);
  if (t.workstream) tags.push(String(t.workstream));
  if (tags.length) bits.push(`(${tags.join(", ")})`);
  return bits.join(" ");
}

// Assemble a plain-text context blob from the live vault for the AI (or for the
// deterministic fallback brief). No invented data: only what the vault holds.
export async function assembleContext(kind: BriefKind): Promise<{
  today: string;
  context: string;
  dueCount: number;
}> {
  const { today, tasks: dueTasks } = await getTodayTasks();
  const open = await getOpenTasks().catch(() => [] as Task[]);
  const meetings = await getMeetingsIndex().catch(() => []);
  const todaysMeetings = meetings.filter((m) => m.date === today);

  const lines: string[] = [];
  lines.push(`Date: ${today}`);
  lines.push(`Brief type: ${META[kind].label}`);
  lines.push("");
  lines.push(`Tasks due today or overdue (${dueTasks.length}):`);
  lines.push(...(dueTasks.length ? dueTasks.map(taskLine) : ["- none"]));
  lines.push("");
  lines.push(`All open tasks (${open.length} total). Top 15 by due date:`);
  lines.push(...(open.slice(0, 15).map(taskLine)));
  lines.push("");
  lines.push(`Meetings today (${todaysMeetings.length}):`);
  lines.push(
    ...(todaysMeetings.length
      ? todaysMeetings.map((m) => `- ${m.title} (${m.bucket})`)
      : ["- none in the index"]),
  );

  return { today, context: lines.join("\n"), dueCount: dueTasks.length };
}

// Deterministic fallback brief when no AI key is configured, so the cron jobs
// still produce a useful brief on schedule (Phase 4 DoD).
function fallbackBrief(kind: BriefKind, context: string): string {
  return [
    `# ${META[kind].label}`,
    "",
    "AI drafting is not configured (ANTHROPIC_API_KEY unset), so this is the raw vault snapshot.",
    "",
    context,
  ].join("\n");
}

export async function writeBrief(
  kind: BriefKind,
): Promise<{ path: string; commit: string; usedAi: boolean }> {
  if (!isVaultConfigured()) {
    throw new Error("Vault not configured; cannot write a brief.");
  }
  const { today, context } = await assembleContext(kind);

  let body: string;
  let usedAi = false;
  if (aiConfigured()) {
    try {
      body = await generateBrief({ kind, context });
      usedAi = true;
    } catch {
      body = fallbackBrief(kind, context);
    }
  } else {
    body = fallbackBrief(kind, context);
  }

  const m = META[kind];
  const path = `${m.folder}/${today}-${m.slug}.md`;
  const content =
    [
      "---",
      "workstream: shared",
      `type: ${m.type}`,
      "status: active",
      `created: ${today}`,
      `date: ${today}`,
      "generated_by: command-center",
      "---",
      "",
    ].join("\n") + body + "\n";

  // Post-cutover (Jordan's decision 2026-07-07): briefs are app-state. The
  // full text lives in the DB and is delivered via the notification; the
  // vault gets a copy only through the deliberate export, not here.
  let commitSha = "";
  if (await cutoverActive()) {
    await setSetting(`brief:${today}:${kind}`, { path, content, usedAi });
  } else {
    const result = await writeFile({
      path,
      content,
      message: `app: ${m.slug} ${today}`,
    });
    commitSha = result.commitSha;
  }

  await createNotification({
    kind: "brief",
    title: `${m.label} for ${today}`,
    body,
    meta: { path, kind },
    dedupeKey: `brief:${kind}:${today}`,
  });

  return { path, commit: commitSha, usedAi };
}
