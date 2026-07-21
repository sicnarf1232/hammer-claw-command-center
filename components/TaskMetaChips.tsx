import Link from "next/link";
import type { TaskView } from "@/lib/taskView";
import { taskStatusLabel, taskStatusColorClass } from "@/lib/taskUpdate";
import { resolveTaskSourceLink } from "@/lib/taskSourceLink";

// The task's "what this is / where it lives" chip row: status, delegate,
// priority, workstream, thread, and a link back to wherever this task came
// from. Shared by TaskDetail (TasksTable.tsx) and TaskCard (TasksGrouped.tsx)
// (dev-feedback #21 parity pass) so the two views can never drift on this
// again, the way TasksGrouped drifted out of having it at all.
//
// The trailing chip used to be a bare filename with no way to open it
// (`t.sourceFile.split("/").pop()`, rendered as inert font-mono text):
// Jordan's "it's pulling in an MD file, but I'm unable to open or see the MD
// file" complaint. resolveTaskSourceLink now points it at the same
// /meetings?note= / /accounts?a= routes the rest of the app already uses,
// wherever a working viewer exists.
export default function TaskMetaChips({ t }: { t: TaskView }) {
  const source = resolveTaskSourceLink(t.sourceFile, t.accountSlug);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`chip whitespace-nowrap ${taskStatusColorClass(t.taskStatus)}`}>
        {taskStatusLabel(t.taskStatus, t.delegatedTo?.name)}
      </span>
      {t.delegatedTo && (
        <span className="chip whitespace-nowrap border-accent2/30 bg-accentSoft text-accent2">
          delegated to {t.delegatedTo.name}
        </span>
      )}
      {t.priority && (
        <span className="chip" style={{ borderColor: "var(--line-2)" }}>
          priority: {t.priority}
        </span>
      )}
      {t.workstream && (
        <span className="chip" style={{ borderColor: "var(--line-2)" }}>
          {t.workstream}
        </span>
      )}
      {t.thread && (
        <span className="chip" style={{ borderColor: "var(--line-2)" }}>
          thread: {t.thread}
        </span>
      )}
      {source ? (
        source.href ? (
          <Link
            href={source.href}
            className="chip font-mono text-2xs hover:underline"
            style={{ borderColor: "var(--line-2)", color: "var(--accent-2)" }}
            title="Open the note this task came from"
          >
            {source.label}
          </Link>
        ) : (
          <span
            className="chip font-mono text-2xs"
            style={{ borderColor: "var(--line-2)" }}
            title="No viewer is available yet for this note."
          >
            {source.label}
          </span>
        )
      ) : null}
    </div>
  );
}
