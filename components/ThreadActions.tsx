"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Flag / archive a whole thread. Applies the action to every message id in the
// thread so the thread's state is consistent in the list view.
export default function ThreadActions({
  ids,
  flagged,
  archived,
}: {
  ids: number[];
  flagged: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isFlagged, setFlagged] = useState(flagged);
  const [isArchived, setArchived] = useState(archived);

  async function act(action: "flag" | "unflag" | "archive" | "unarchive") {
    setBusy(true);
    try {
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (res.ok) {
        if (action === "flag" || action === "unflag") setFlagged(action === "flag");
        if (action === "archive" || action === "unarchive") setArchived(action === "archive");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => act(isFlagged ? "unflag" : "flag")}
        className="btn-outline text-xs"
        title={isFlagged ? "Remove flag" : "Flag this thread"}
      >
        {isFlagged ? "🚩 Flagged" : "Flag"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act(isArchived ? "unarchive" : "archive")}
        className="btn-ghost text-xs"
      >
        {isArchived ? "Unarchive" : "Archive"}
      </button>
    </div>
  );
}
