import { confirmTaskEmailLinks } from "@/lib/taskEmailLinks";

// General manual "link this email to task(s)" (dev-feedback #15), distinct
// from the AI-suggestion confirm flow in components/TaskEmailLink.tsx /
// app/api/tasks/link-email/route.ts. Jordan picks any number of tasks for one
// email; this loops the EXISTING confirmed-link writer
// (lib/taskEmailLinks.ts confirmTaskEmailLinks, built for "many emails on one
// task") the other direction instead of duplicating its DB write logic.

export function parseTaskViewId(id: string): { sourceFile: string; sourceLine: number } | null {
  const idx = id.lastIndexOf(":");
  if (idx <= 0) return null;
  const sourceFile = id.slice(0, idx);
  const sourceLine = Number(id.slice(idx + 1));
  if (!Number.isInteger(sourceLine)) return null;
  return { sourceFile, sourceLine };
}

export interface LinkTasksResult {
  linked: string[];
  failed: string[];
}

export async function linkTasksToEmail(taskIds: string[], emailId: number): Promise<LinkTasksResult> {
  const linked: string[] = [];
  const failed: string[] = [];
  for (const taskId of Array.from(new Set(taskIds))) {
    const parsed = parseTaskViewId(taskId);
    if (!parsed) {
      failed.push(taskId);
      continue;
    }
    try {
      await confirmTaskEmailLinks({
        sourceFile: parsed.sourceFile,
        sourceLine: parsed.sourceLine,
        emailIds: [emailId],
        aiGenerated: false,
      });
      linked.push(taskId);
    } catch {
      failed.push(taskId);
    }
  }
  return { linked, failed };
}
