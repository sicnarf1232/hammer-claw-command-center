"use client";

import { useState } from "react";

// Phase D: share a meeting note (or series) as a branded Film Room PDF, or copy
// a clean HTML version for pasting into an email body. PDF is the primary path.
export default function MeetingShareButtons({
  path,
  seriesPath,
  filename,
  emailHtml,
}: {
  path?: string;
  seriesPath?: string;
  filename: string;
  emailHtml: string;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function downloadPdf() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/meetings/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seriesPath ? { seriesPath } : { path }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "Could not generate the PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Network error generating the PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function copyForEmail() {
    setErr(null);
    const plain = emailHtml.replace(/<[^>]+>/g, "").replace(/\n{2,}/g, "\n").trim();
    try {
      // Rich copy (text/html) so pasting into an email keeps the formatting;
      // fall back to plain text if ClipboardItem is unavailable or blocked.
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([emailHtml], { type: "text/html" }),
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
          title="Download a branded Film Room PDF"
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
