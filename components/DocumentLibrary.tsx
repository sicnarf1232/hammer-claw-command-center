"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOC_TYPES, docTypeLabel, type DocType } from "@/lib/documents";

// Milestone 3 #1: upload + browse the document library. Self-contained: fetches
// its own list from /api/documents. Used by the global /library page and, scoped
// by account + allowed types, by the account Quality / OEM PCNs tabs.

interface DocRow {
  id: number;
  title: string;
  fileName: string;
  blobUrl: string;
  docType: string;
  account: string | null;
  sizeBytes: number | null;
  notes: string | null;
  uploadedAt: string;
}

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentLibrary({
  account,
  allowedTypes,
  accountOptions = [],
  compact = false,
}: {
  account?: string;
  allowedTypes?: DocType[];
  accountOptions?: string[];
  compact?: boolean;
}) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const typeChoices = useMemo(
    () => DOC_TYPES.filter((d) => !allowedTypes || allowedTypes.includes(d.key)),
    [allowedTypes],
  );

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<string>(typeChoices[0]?.key ?? "other");
  const [acct, setAcct] = useState(account ?? "");
  const [notes, setNotes] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = account ? `/api/documents?account=${encodeURIComponent(account)}` : "/api/documents";
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      setEnabled(data.enabled !== false);
      let list: DocRow[] = data.documents ?? [];
      if (allowedTypes) list = list.filter((d) => allowedTypes.includes(d.docType as DocType));
      setDocs(list);
    } catch {
      setErr("Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, [account, allowedTypes]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setErr("Choose a file first.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", title || file.name);
      fd.set("docType", docType);
      if (acct.trim()) fd.set("account", acct.trim());
      if (notes.trim()) fd.set("notes", notes.trim());
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Upload failed.");
      } else {
        setFile(null);
        setTitle("");
        setNotes("");
        if (fileInput.current) fileInput.current.value = "";
        setShow(false);
        await load();
      }
    } catch {
      setErr("Network error during upload.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Remove this document from the library?")) return;
    setDocs((prev) => prev.filter((d) => d.id !== id)); // optimistic
    await fetch(`/api/documents?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  if (!enabled) {
    return (
      <div className="rounded-[12px] border border-dashed p-6 text-sm text-muted" style={{ borderColor: "var(--line-2)" }}>
        The document library needs <code className="font-mono">POSTGRES_URL</code> and{" "}
        <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> set in the environment.
        Once Vercel Blob is connected, uploads and search light up here.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm text-muted">
          {loading ? "Loading…" : `${docs.length} document${docs.length === 1 ? "" : "s"}`}
        </span>
        <button onClick={() => setShow((s) => !s)} className="btn btn-primary px-3 py-1 text-xs">
          {show ? "Close" : "Upload"}
        </button>
      </div>

      {show && (
        <form onSubmit={upload} className="card mb-4 grid gap-3 p-4">
          <input
            ref={fileInput}
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
            }}
            className="text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" />
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input">
              {typeChoices.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            <input
              value={acct}
              onChange={(e) => setAcct(e.target.value)}
              list="hc-doc-accounts"
              placeholder="Account (optional)"
              className="input"
              disabled={!!account}
            />
            <datalist id="hc-doc-accounts">
              {accountOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="input min-h-[60px]" />
          {err && <p className="text-sm text-danger">{err}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-60">
              {busy ? "Uploading…" : "Upload to library"}
            </button>
            <span className="text-2xs text-muted">PDFs are text-extracted so the brain can read them.</span>
          </div>
        </form>
      )}

      {!loading && docs.length === 0 ? (
        <p className="text-sm text-muted">
          No documents yet{account ? ` for ${account}` : ""}. Upload ISO docs, biocomp, drawings, certs, PCNs, or specs.
        </p>
      ) : (
        <div className={compact ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
          {docs.map((d) => (
            <div key={d.id} className="flex items-start gap-3 rounded-[12px] border p-3" style={{ borderColor: "var(--line)" }}>
              <span className="chip whitespace-nowrap text-2xs" style={{ borderColor: "var(--line-2)" }}>
                {docTypeLabel(d.docType)}
              </span>
              <div className="min-w-0 flex-1">
                <a href={`/api/documents/file?id=${d.id}`} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold hover:underline" style={{ color: "var(--accent-2)" }}>
                  {d.title}
                </a>
                <div className="mt-0.5 truncate text-2xs text-muted">
                  {[d.account, fmtSize(d.sizeBytes), d.uploadedAt?.slice(0, 10)].filter(Boolean).join(" · ")}
                </div>
                {d.notes && <p className="mt-1 text-xs text-fg/70">{d.notes}</p>}
              </div>
              <button onClick={() => remove(d.id)} className="text-muted hover:text-danger" aria-label="Remove document">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
