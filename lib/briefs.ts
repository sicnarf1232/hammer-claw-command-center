import { writeFile, isVaultConfigured } from "@/lib/github";
import { getOpenTasks, getMeetingsIndex } from "@/lib/vault";
import { getTodayTasks } from "@/lib/today";
import { generateStructuredBrief, aiConfigured, type StructuredBrief } from "@/lib/ai";
import { createNotification } from "@/lib/notify";
import { todayISO } from "@/lib/dates";
import { cutoverActive } from "@/lib/dbSource";
import { setSetting } from "@/lib/settings";
import type { Task } from "@/lib/vault/types";

export type BriefKind = "morning" | "eod" | "weekly";
export type { StructuredBrief, StructuredBriefSection } from "@/lib/ai";

const META = {
  morning: { label: "Morning Brief", folder: "100 Periodics/Daily", type: "daily", slug: "morning-brief" },
  eod: { label: "End of Day Recap", folder: "100 Periodics/Daily", type: "daily", slug: "eod-recap" },
  weekly: { label: "Weekly Review", folder: "100 Periodics/Weekly", type: "weekly", slug: "weekly-review" },
} as const;

// One task, formatted as a plain phrase (no leading bullet), reused by both
// the flattened AI context text and the fallback structured sections.
function taskLineItem(t: Task): string {
  const bits: string[] = [t.title];
  const tags: string[] = [];
  if (t.customer && t.customer !== "internal") tags.push(t.customer.display);
  if (t.due) tags.push(`due ${t.due}`);
  if (t.priority) tags.push(t.priority);
  if (t.workstream) tags.push(String(t.workstream));
  if (tags.length) bits.push(`(${tags.join(", ")})`);
  return bits.join(" ");
}

function taskLine(t: Task): string {
  return `- ${taskLineItem(t)}`;
}

export interface BriefMeeting {
  title: string;
  bucket: string;
}

// Assemble both the plain-text context blob for the AI, and the underlying
// structured pieces (due tasks, open tasks, today's meetings) so the
// deterministic fallback can build clean sections instead of dumping the same
// text blob when there is no AI key. No invented data: only what the vault
// holds either way.
export async function assembleContext(kind: BriefKind): Promise<{
  today: string;
  context: string;
  dueCount: number;
  dueTasks: Task[];
  open: Task[];
  todaysMeetings: BriefMeeting[];
}> {
  const { today, tasks: dueTasks } = await getTodayTasks();
  const open = await getOpenTasks().catch(() => [] as Task[]);
  const meetings = await getMeetingsIndex().catch(() => []);
  const todaysMeetings = meetings
    .filter((m) => m.date === today)
    .map((m) => ({ title: m.title, bucket: m.bucket }));

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

  return { today, context: lines.join("\n"), dueCount: dueTasks.length, dueTasks, open, todaysMeetings };
}

// Deterministic fallback brief when no AI key is configured (or the AI call
// fails), so the cron jobs still produce a useful, cleanly structured brief on
// schedule (Phase 4 DoD) instead of a raw text dump. Pure and unit tested.
export function structuredFallbackBrief(
  data: { dueTasks: Task[]; open: Task[]; todaysMeetings: BriefMeeting[] },
): StructuredBrief {
  const sections: { heading: string; items: string[] }[] = [];
  const dueKeys = new Set(data.dueTasks.map((t) => `${t.sourceFile}:${t.sourceLine}`));

  if (data.dueTasks.length) {
    sections.push({
      heading: "Due today or overdue",
      items: data.dueTasks.slice(0, 8).map(taskLineItem),
    });
  }

  const comingUp = data.open.filter((t) => !dueKeys.has(`${t.sourceFile}:${t.sourceLine}`)).slice(0, 5);
  if (comingUp.length) {
    sections.push({ heading: "Coming up", items: comingUp.map(taskLineItem) });
  }

  if (data.todaysMeetings.length) {
    sections.push({
      heading: "Meetings today",
      items: data.todaysMeetings.slice(0, 8).map((m) => `${m.title} (${m.bucket})`),
    });
  }

  const headlineParts = [
    data.dueTasks.length ? `${data.dueTasks.length} due today` : null,
    data.todaysMeetings.length
      ? `${data.todaysMeetings.length} meeting${data.todaysMeetings.length === 1 ? "" : "s"}`
      : null,
  ].filter((p): p is string => Boolean(p));

  return {
    headline: headlineParts.length ? headlineParts.join(", ") : "Nothing urgent today.",
    sections,
    modelUsed: "fallback",
  };
}

// Render a structured brief as clean markdown, for the vault export copy only
// (the app itself renders the structured JSON directly). Pure and unit tested.
export function structuredBriefToMarkdown(kind: BriefKind, brief: StructuredBrief): string {
  const lines: string[] = [`# ${META[kind].label}`, ""];
  if (brief.headline) lines.push(brief.headline, "");
  for (const s of brief.sections) {
    lines.push(`## ${s.heading}`, "");
    lines.push(...(s.items.length ? s.items.map((i) => `- ${i}`) : ["- none"]));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export async function writeBrief(
  kind: BriefKind,
): Promise<{ path: string; commit: string; usedAi: boolean }> {
  if (!isVaultConfigured()) {
    throw new Error("Vault not configured; cannot write a brief.");
  }
  const { today, context, dueTasks, open, todaysMeetings } = await assembleContext(kind);

  let structured: StructuredBrief;
  let usedAi = false;
  if (aiConfigured()) {
    try {
      structured = await generateStructuredBrief({ kind, context });
      usedAi = true;
    } catch {
      structured = structuredFallbackBrief({ dueTasks, open, todaysMeetings });
    }
  } else {
    structured = structuredFallbackBrief({ dueTasks, open, todaysMeetings });
  }

  const markdown = structuredBriefToMarkdown(kind, structured);

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
    ].join("\n") + markdown + "\n";

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
    body: structured.headline || markdown.slice(0, 240),
    meta: { path, kind, structured },
    dedupeKey: `brief:${kind}:${today}`,
  });

  return { path, commit: commitSha, usedAi };
}
