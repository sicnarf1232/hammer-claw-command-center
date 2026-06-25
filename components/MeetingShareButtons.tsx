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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const htmlRef = useRef<string | null>(null);

  const targetBody = JSON.stringify(seriesPath ? { seriesPath } : { path });
  const printQuery = seriesPath
    ? `series=${encodeURIComponent(seriesPath)}`
    : `note=${encodeURIComponent(path ?? "")}`;

  function filenameFromDisposition(cd: string | null): string | null {
    const m = cd?.match(/filename="?([^"]+)"?/i);
    return m ? m[1] : null;
  }

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

  async function downloadPdf() {
    setErr(null);
    setBusy(true);
    try {
      // Real, auto-downloading PDF rendered server-side from the same shared
      // HTML (headless Chromium). No print dialog.
      const res = await fetch(`/api/meetings/pdf?${printQuery}`);
      if (!res.ok) {
        setErr("Could not build the PDF. Opening a printable view instead.");
        window.open(`/api/meetings/print?${printQuery}`, "_blank");
        return;
      }
      const blob = await res.blob();
      const name = filenameFromDisposition(res.headers.get("content-disposition")) || "meeting-notes.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Network error building the PDF. Opening a printable view instead.");
      window.open(`/api/meetings/print?${printQuery}`, "_blank");
    } finally {
      setBusy(false);
    }
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
          disabled={busy}
          className="btn btn-primary px-3 py-1 text-xs disabled:opacity-60"
          title="Download a branded PDF"
        >
          {busy ? "Building PDF…" : "Download PDF"}
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
