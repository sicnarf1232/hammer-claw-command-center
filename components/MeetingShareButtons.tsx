"use client";

import { useEffect, useRef, useState } from "react";

// Phase 3: share a meeting note (or series) as a branded PDF, or copy a clean,
// client-branded HTML version for pasting into an email body. The HTML and the
// PDF both come from the one shared template (no drift). The email HTML is
// prefetched on mount so the clipboard write stays inside the click gesture.
export default function MeetingShareButtons({
  path,
  seriesPath,
}: {
  path?: string;
  seriesPath?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const htmlRef = useRef<string | null>(null);

  const targetBody = JSON.stringify(seriesPath ? { seriesPath } : { path });
  const printQuery = seriesPath
    ? `series=${encodeURIComponent(seriesPath)}`
    : `note=${encodeURIComponent(path ?? "")}`;

  // Prefetch the rendered email HTML so "Copy" can write synchronously.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/meetings/share-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: targetBody,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.html) htmlRef.current = data.html as string;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [targetBody]);

  function downloadPdf() {
    setErr(null);
    // Open the standalone, client-branded print view of the shared HTML; it
    // auto-opens the print dialog so you can Save as PDF (same HTML as the email
    // copy and the in-app view).
    const win = window.open(`/api/meetings/print?${printQuery}`, "_blank");
    if (!win) setErr("Allow pop-ups to open the printable PDF view.");
  }

  async function copyForEmail() {
    setErr(null);
    let html = htmlRef.current;
    if (!html) {
      // Not prefetched yet (slow network): fetch now, best effort.
      try {
        const res = await fetch("/api/meetings/share-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: targetBody,
        });
        const data = res.ok ? await res.json() : null;
        html = data?.html ?? null;
        if (html) htmlRef.current = html;
      } catch {
        /* fall through to error below */
      }
    }
    if (!html) {
      setErr("Could not prepare the email. Try the PDF instead.");
      return;
    }
    const plain = html.replace(/<[^>]+>/g, "").replace(/\n{2,}/g, "\n").trim();
    try {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } catch {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("Could not copy. Try the PDF instead.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={downloadPdf}
          className="btn btn-primary px-3 py-1 text-xs"
          title="Open a branded print view, then Save as PDF"
        >
          Download PDF
        </button>
        <button
          onClick={copyForEmail}
          className="btn btn-ghost px-3 py-1 text-xs"
          title="Copy a clean HTML version for an email body"
        >
          {copied ? "Copied" : "Copy for email"}
        </button>
      </div>
      {err && <p className="text-2xs text-danger">{err}</p>}
    </div>
  );
}
