"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MicButton from "@/components/MicButton";
import {
  composeLeadTimeSummary,
  defaultLeadTime,
  deriveQuoteId,
  inferSterility,
  parseDateParts,
} from "@/lib/quote/derive";
import {
  BLANK_LINE_ITEM,
  type Closing,
  type QuoteLineItem,
  type QuoteSpec,
  type TableHeaderStyle,
} from "@/lib/quote/types";

export interface CatalogEntry {
  partNumber: string;
  description: string;
  unitCost: number | null;
}

export interface AccountOption {
  name: string;
  slug: string;
  contacts?: string[];
}

// Prefill seed passed in from a deep link (e.g. "Create quote" on a task).
export interface QuoteSeed {
  customer?: string;
  contact?: string;
  description?: string;
  parseText?: string;
}

interface UiLineItem extends QuoteLineItem {
  id: string;
}

interface Meta {
  customerName: string;
  customerShort: string;
  customerContact: string;
  description: string;
  quoteDate: string;
  quoteShort: string;
  quoteIdOverride: string;
  leadTimeSummaryOverride: string;
  tableHeaderStyle: TableHeaderStyle;
  showPageNumbers: boolean;
}

const DRAFT_KEY = "hc-quote-draft";
let idCounter = 0;
const nextId = () => `li-${Date.now().toString(36)}-${idCounter++}`;

const BLANK_META: Meta = {
  customerName: "",
  customerShort: "",
  customerContact: "",
  description: "",
  quoteDate: "",
  quoteShort: "",
  quoteIdOverride: "",
  leadTimeSummaryOverride: "",
  tableHeaderStyle: "Merit Red",
  showPageNumbers: true,
};

const CLOSINGS: Closing[] = ["", "Bulk Non-Sterile.", "Sterile", "Single-Sterile."];

interface RecentQuote {
  id: number;
  title: string;
  account: string | null;
  uploadedAt: string;
  hasSpec: boolean;
  spec: QuoteSpec | null;
}

export default function QuoteBuilder({
  catalog,
  accounts = [],
  today,
  seed,
}: {
  catalog: CatalogEntry[];
  accounts?: AccountOption[];
  today: string; // ISO YYYY-MM-DD in the app timezone
  seed?: QuoteSeed;
}) {
  const [meta, setMeta] = useState<Meta>(BLANK_META);
  const [items, setItems] = useState<UiLineItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseText, setParseText] = useState("");
  const [parseMode, setParseMode] = useState<"auto" | "structured" | "freeform">("freeform");
  const [parsing, setParsing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentQuote[]>([]);
  const [showRecent, setShowRecent] = useState(false);

  const byPart = useMemo(() => {
    const m = new Map<string, CatalogEntry>();
    for (const c of catalog) m.set(c.partNumber, c);
    return m;
  }, [catalog]);

  const matchedAccount = useMemo(() => {
    const key = meta.customerName.trim().toLowerCase();
    if (!key) return null;
    return accounts.find((a) => a.name.trim().toLowerCase() === key) ?? null;
  }, [accounts, meta.customerName]);

  const accountContacts = matchedAccount?.contacts ?? [];

  // Load recent saved quotes for the "Recent quotes" panel + re-edit.
  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/quote/recent");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.quotes)) setRecent(data.quotes as RecentQuote[]);
    } catch {
      /* best-effort */
    }
  }, []);
  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // When an account is chosen and no contact is set yet, offer its first contact.
  useEffect(() => {
    if (!loaded) return;
    if (!meta.customerContact.trim() && accountContacts.length > 0) {
      setMeta((m) =>
        m.customerContact.trim() ? m : { ...m, customerContact: accountContacts[0] },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedAccount]);

  // ---- Draft persistence (localStorage) ----
  useEffect(() => {
    let m: Meta = { ...BLANK_META, quoteDate: today };
    let its: UiLineItem[] = [];
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { meta: Meta; items: UiLineItem[] };
        if (d.meta) m = { ...m, ...d.meta, quoteDate: toISO(d.meta.quoteDate) || today };
        if (Array.isArray(d.items)) its = d.items;
      }
    } catch {
      /* ignore a corrupt draft */
    }
    // A task seed (deep link) takes precedence over the saved draft.
    if (seed) {
      if (seed.customer) m.customerName = seed.customer;
      if (seed.contact) m.customerContact = seed.contact;
      if (seed.description) m.description = seed.description;
      if (seed.parseText) setParseText(seed.parseText);
    }
    setMeta(m);
    setItems(its);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ meta, items }));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [meta, items, loaded]);

  // ---- Derived display values ----
  const derivedQuoteId = useMemo(
    () =>
      deriveQuoteId({
        customerShort: meta.customerShort,
        customerName: meta.customerName,
        quoteDate: meta.quoteDate,
        quoteShort: meta.quoteShort,
      }),
    [meta.customerShort, meta.customerName, meta.quoteDate, meta.quoteShort],
  );
  const quoteId = meta.quoteIdOverride.trim() || derivedQuoteId;

  const stripped = (it: UiLineItem): QuoteLineItem => {
    const { id, ...rest } = it;
    void id;
    return rest;
  };
  const derivedSummary = useMemo(
    () => composeLeadTimeSummary(items.map(stripped)),
    [items],
  );

  const rawPayload = useCallback(() => {
    return {
      customerName: meta.customerName,
      customerShort: meta.customerShort,
      customerContact: meta.customerContact,
      description: meta.description,
      quoteDate: meta.quoteDate,
      quoteShort: meta.quoteShort,
      quoteId: meta.quoteIdOverride.trim() || undefined,
      leadTimeSummary: meta.leadTimeSummaryOverride.trim() || undefined,
      tableHeaderStyle: meta.tableHeaderStyle,
      showPageNumbers: meta.showPageNumbers,
      lineItems: items.map(stripped),
    };
  }, [meta, items]);

  // ---- Live preview (debounced) ----
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/quote/html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rawPayload()),
        });
        if (res.ok) setPreviewHtml(await res.text());
      } catch {
        /* preview is best-effort */
      }
    }, 600);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [rawPayload, loaded]);

  // ---- Client-side validation mirror (server is authoritative) ----
  const validation = useMemo(() => validateClient(meta, items, quoteId), [meta, items, quoteId]);

  // ---- Mutations ----
  function patchItem(id: string, patch: Partial<UiLineItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addCustom() {
    const it: UiLineItem = { ...BLANK_LINE_ITEM, id: nextId() };
    setItems((prev) => [...prev, it]);
    setExpanded(it.id);
  }

  function addFromCatalog(partNumber: string) {
    const match = byPart.get(partNumber);
    if (!match) return;
    const inf = inferSterility(partNumber, match.description);
    const def = defaultLeadTime(inf.closing);
    const it: UiLineItem = {
      ...BLANK_LINE_ITEM,
      id: nextId(),
      custom: false,
      partNo: partNumber,
      title: deriveTitleClient(match.description),
      attributes: match.description ? [match.description] : [],
      closing: inf.closing,
      price: match.unitCost != null ? `$${match.unitCost}` : "",
      leadStacked: Boolean(def),
      leadAlt: def,
      leadTime: "",
    };
    setItems((prev) => [...prev, it]);
    setExpanded(it.id);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function runParse() {
    if (!parseText.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/quote/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: parseText, mode: parseMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not parse the input.");
        return;
      }
      mergeSpec(data.spec as QuoteSpec);
      setParseText("");
    } catch {
      setError("Network error while parsing.");
    } finally {
      setParsing(false);
    }
  }

  // Merge parsed results into the current quote: only fill meta fields the
  // parser actually found (never clobber what was typed), and append the parsed
  // line items to any already present.
  function mergeSpec(spec: QuoteSpec) {
    setMeta((prev) => ({
      ...prev,
      customerName: spec.customerName || prev.customerName,
      customerShort: spec.customerShort || prev.customerShort,
      customerContact: spec.quotedFor || prev.customerContact,
      description: spec.description || prev.description,
      quoteDate: toISO(spec.quoteDate) || prev.quoteDate,
      quoteShort: spec.quoteShort || prev.quoteShort,
    }));
    setItems((prev) => [
      ...prev,
      ...spec.lineItems.map((li) => ({ ...li, id: nextId() })),
    ]);
  }

  // Re-open a saved quote for editing (revision). Full replace of the builder
  // state; saving keeps the same quote id so it overwrites the stored version.
  function reEdit(q: RecentQuote) {
    if (!q.spec) {
      setError("That quote was saved before re-edit was supported; re-create it to enable editing.");
      return;
    }
    const spec = q.spec;
    setMeta({
      customerName: spec.customerName,
      customerShort: spec.customerShort,
      customerContact: spec.quotedFor,
      description: spec.description,
      quoteDate: toISO(spec.quoteDate) || today,
      quoteShort: spec.quoteShort,
      quoteIdOverride: "",
      leadTimeSummaryOverride: "",
      tableHeaderStyle: spec.tableHeaderStyle,
      showPageNumbers: spec.showPageNumbers,
    });
    setItems(spec.lineItems.map((li) => ({ ...li, id: nextId() })));
    setExpanded(null);
    setError(null);
    setSaved(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function newQuote() {
    if (!confirm("Start a new quote? This clears the current draft.")) return;
    setMeta({ ...BLANK_META, quoteDate: today });
    setItems([]);
    setExpanded(null);
    setError(null);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  async function saveToAccount() {
    setError(null);
    setSaved(null);
    if (validation.errors.length > 0) {
      setError("Fix the items flagged below before saving.");
      return;
    }
    if (!meta.customerName.trim()) {
      setError("Set a customer / account to save the quote against.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/quote/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rawPayload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.details?.join(" ") ?? data.error ?? "Could not save the quote.");
        return;
      }
      setSaved(`Saved to ${meta.customerName} — see the account's Quotes tab.`);
      void loadRecent();
    } catch {
      setError("Network error saving the quote.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    setError(null);
    if (validation.errors.length > 0) {
      setError("Fix the items flagged below before downloading.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/quote/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rawPayload()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.details?.join(" ") ?? data.error ?? "Could not generate the PDF.",
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${quoteId || "quote"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error generating the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- Editor (full width; preview stacks below) ---- */}
      <div className="min-w-0">
        <datalist id="catalog-parts">
          {catalog.map((c) => (
            <option key={c.partNumber} value={c.partNumber}>
              {c.description}
            </option>
          ))}
        </datalist>
        <datalist id="account-names">
          {accounts.map((a) => (
            <option key={a.slug} value={a.name} />
          ))}
        </datalist>
        <datalist id="account-contacts">
          {accountContacts.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {/* Top action bar: New quote + Save are always visible. */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button onClick={newQuote} className="btn-outline">New quote</button>
          <button onClick={saveToAccount} disabled={saving || validation.errors.length > 0}
            className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : "Save quote"}
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
          {saved && <span className="text-xs text-success">{saved}</span>}
        </div>

        {/* Quote details (collapsible so the preview stays in view) */}
        <details className="card p-4" open>
          <summary className="mb-3 cursor-pointer text-sm font-semibold text-fg">Quote details</summary>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer / account">
              <input className="input mt-1 w-full" value={meta.customerName}
                list="account-names" placeholder="Select an account or type a new one"
                onChange={(e) => setMeta({ ...meta, customerName: e.target.value })} />
              {matchedAccount ? (
                <a href={`/accounts?a=${matchedAccount.slug}`} className="mt-1 inline-block text-2xs text-muted hover:underline">
                  Linked account: {matchedAccount.name} ↗
                </a>
              ) : meta.customerName.trim() ? (
                <span className="mt-1 inline-block text-2xs text-amber-600">New account quote (no match in vault)</span>
              ) : null}
            </Field>
            <Field label="Customer short (optional)">
              <input className="input mt-1 w-full" value={meta.customerShort}
                placeholder="defaults to first word"
                onChange={(e) => setMeta({ ...meta, customerShort: e.target.value })} />
            </Field>
            <Field label="Contact (Quoted For)">
              <input className="input mt-1 w-full" value={meta.customerContact}
                list="account-contacts"
                placeholder={accountContacts.length ? "Pick or type a contact" : "Type a contact name"}
                onChange={(e) => setMeta({ ...meta, customerContact: e.target.value })} />
              {accountContacts.length > 0 && (
                <span className="mt-1 inline-block text-2xs text-muted">
                  {accountContacts.length} contact{accountContacts.length > 1 ? "s" : ""} on this account
                </span>
              )}
            </Field>
            <Field label="Quote date">
              <div className="mt-1 flex items-center gap-2">
                <input type="date" className="input w-full" value={meta.quoteDate}
                  onChange={(e) => setMeta({ ...meta, quoteDate: e.target.value })} />
                {meta.quoteDate !== today && (
                  <button type="button" className="btn-ghost whitespace-nowrap text-xs"
                    onClick={() => setMeta({ ...meta, quoteDate: today })}>Today</button>
                )}
              </div>
            </Field>
            <Field label="Description">
              <input className="input mt-1 w-full" value={meta.description}
                onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </Field>
            <Field label="Quote tag (quote_short)">
              <input className="input mt-1 w-full" value={meta.quoteShort}
                placeholder="e.g. 8F Dilators"
                onChange={(e) => setMeta({ ...meta, quoteShort: e.target.value })} />
            </Field>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Quote ID">
              <input className="input mt-1 w-full font-mono text-xs"
                value={meta.quoteIdOverride} placeholder={derivedQuoteId}
                onChange={(e) => setMeta({ ...meta, quoteIdOverride: e.target.value })} />
            </Field>
            <Field label="Lead-time summary (override)">
              <input className="input mt-1 w-full text-xs"
                value={meta.leadTimeSummaryOverride} placeholder={derivedSummary || "auto-composed"}
                onChange={(e) => setMeta({ ...meta, leadTimeSummaryOverride: e.target.value })} />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-muted">Header</span>
              <select className="input" value={meta.tableHeaderStyle}
                onChange={(e) => setMeta({ ...meta, tableHeaderStyle: e.target.value as TableHeaderStyle })}>
                <option value="Merit Red">Merit Red</option>
                <option value="Graphite">Graphite</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={meta.showPageNumbers}
                onChange={(e) => setMeta({ ...meta, showPageNumbers: e.target.checked })} />
              <span className="text-muted">Show page numbers</span>
            </label>
          </div>
        </details>

        {/* Add or parse items (collapsible) */}
        <details className="card mt-4 p-4">
          <summary className="mb-3 cursor-pointer text-sm font-semibold text-fg">Add or parse items</summary>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Add from price list">
              <input list="catalog-parts" className="input mt-1 w-56 font-mono"
                placeholder={`${catalog.length} parts`}
                onChange={(e) => {
                  if (byPart.has(e.target.value)) {
                    addFromCatalog(e.target.value);
                    e.target.value = "";
                  }
                }} />
            </Field>
            <button className="btn-outline" onClick={addCustom}>+ Custom item</button>
          </div>

          <div className="mt-4">
            <div className="mb-1 text-sm font-semibold text-fg">Paste or dictate a quote</div>
            <div className="mt-2">
              <textarea className="input w-full font-mono text-xs" rows={6}
                value={parseText} onChange={(e) => setParseText(e.target.value)}
                placeholder={"Customer: Balt\nContact: Guru Vattikuti\n\nLine Item 1\n* Quantity: 1\n* Part Number: NRE\n* Description: NRE - 8F Custom Green Dilator Setup  (this is the bold TITLE)\n* Details:\n   * 8F French size  (these are the attribute lines)\n   * Bulk Non-Sterile.  (sterility line, bolded on the doc)\n* Unit Price: $41,200\n* Lead Time: 24-30 weeks"} />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted">Mode</span>
                  <select className="input" value={parseMode}
                    onChange={(e) => setParseMode(e.target.value as typeof parseMode)}>
                    <option value="auto">Auto</option>
                    <option value="structured">Structured</option>
                    <option value="freeform">Free-form (AI)</option>
                  </select>
                </label>
                <button className="btn-outline" onClick={runParse} disabled={parsing}>
                  {parsing ? "Parsing…" : "Parse into quote"}
                </button>
                <MicButton onText={(t) => setParseText((p) => (p ? `${p} ${t}` : t))} title="Dictate the quote" />
                <span className="text-2xs text-muted">Adds parsed items; keeps fields you typed.</span>
              </div>

              <details className="mt-3 rounded-[10px] border p-3 text-2xs leading-relaxed text-muted" style={{ borderColor: "var(--line-2)" }}>
                <summary className="cursor-pointer font-semibold text-fg">Mode guide &amp; what to include</summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="font-semibold text-fg">Modes</div>
                    <p><b>Free-form (AI)</b>: plain English, parsed by AI (needs ANTHROPIC_API_KEY). Best for dictation. Default.</p>
                    <p><b>Structured</b>: deterministic. Use the <code>Line Item N</code> + <code>* Key: Value</code> format (no AI).</p>
                    <p><b>Auto</b>: tries structured first, falls back to AI if it sees no line items.</p>
                  </div>
                  <div>
                    <div className="font-semibold text-fg">What to include per item</div>
                    <p><b>Description / Title</b>: the product name, rendered big + bold at the top of the cell.</p>
                    <p><b>Details</b> (sub-lines): each becomes an attribute line. Put the sterility as its own line (<b>Bulk Non-Sterile.</b> / <b>Sterile</b> / <b>Single-Sterile.</b>) so it renders bold.</p>
                    <p><b>Quantity</b> (supports 5,000, 100+, &gt;500), <b>Part Number</b>, <b>Unit Price</b>, <b>Lead Time</b>.</p>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </details>

        {/* Line items */}
        <section className="mt-4 space-y-2">
          {items.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">
              No line items yet. Add from the price list, add a custom item, or paste a quote.
            </div>
          ) : (
            items.map((it, idx) => (
              <LineItemCard
                key={it.id}
                item={it}
                index={idx}
                count={items.length}
                expanded={expanded === it.id}
                onToggle={() => setExpanded(expanded === it.id ? null : it.id)}
                onPatch={(p) => patchItem(it.id, p)}
                onRemove={() => removeItem(it.id)}
                onMove={(d) => move(it.id, d)}
              />
            ))
          )}
        </section>

        {/* Validation */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <section className="mt-4 space-y-1 text-xs">
            {validation.errors.map((e, i) => (
              <div key={`e${i}`} className="text-danger">• {e}</div>
            ))}
            {validation.warnings.map((w, i) => (
              <div key={`w${i}`} className="text-amber-600">• {w}</div>
            ))}
          </section>
        )}

        {/* Recent quotes: under the line items, before Download. Narrow dropdown. */}
        {recent.length > 0 && (
          <div className="mt-4 max-w-md">
            <RecentQuotes
              recent={recent}
              open={showRecent}
              onToggle={() => setShowRecent((v) => !v)}
              onReEdit={reEdit}
            />
          </div>
        )}

        {/* Download */}
        <div className="mt-4">
          <button onClick={downloadPdf} disabled={busy || validation.errors.length > 0}
            className="btn-primary disabled:opacity-50">
            {busy ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>

      {/* ---- Live preview (stacked below the editor, full width) ---- */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-2xs uppercase tracking-wide text-muted">Live preview</span>
          <span className="font-mono text-2xs text-muted">{quoteId}</span>
        </div>
        <div className="card overflow-hidden p-0" style={{ height: "120vh" }}>
          <iframe title="Quote preview" srcDoc={previewHtml}
            className="h-full w-full border-0" style={{ background: "#E4E4E6" }} />
        </div>
        <p className="mt-2 text-2xs text-muted">
          The preview is the exact document the PDF prints. Scroll to see all pages.
        </p>
      </div>
    </div>
  );
}

// ---- Subcomponents -------------------------------------------------------

// Monday of the week containing d (local time).
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}
function weekLabel(iso: string, now: Date): string {
  const wk = mondayOf(new Date(iso));
  const thisWk = mondayOf(now);
  const diff = Math.round((thisWk.getTime() - wk.getTime()) / (7 * 86_400_000));
  if (diff <= 0) return "This week";
  if (diff === 1) return "Last week";
  return `Week of ${wk.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function RecentQuotes({
  recent,
  open,
  onToggle,
  onReEdit,
}: {
  recent: RecentQuote[];
  open: boolean;
  onToggle: () => void;
  onReEdit: (q: RecentQuote) => void;
}) {
  const groups = useMemo(() => {
    const now = new Date();
    const out: { label: string; items: RecentQuote[] }[] = [];
    for (const q of recent) {
      const label = weekLabel(q.uploadedAt, now);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(q);
      else out.push({ label, items: [q] });
    }
    return out;
  }, [recent]);

  return (
    <section className="card mb-4 p-4">
      <button onClick={onToggle} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-semibold text-fg">Recent quotes</span>
        <span className="text-2xs text-muted">{recent.length} saved · {open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="text-2xs uppercase tracking-wide text-muted">{g.label}</div>
              <div className="mt-1 space-y-1">
                {g.items.map((q) => (
                  <div key={q.id} className="flex items-center gap-2 text-sm">
                    {q.hasSpec ? (
                      <button onClick={() => onReEdit(q)}
                        className="min-w-0 flex-1 truncate text-left font-mono text-xs hover:underline"
                        style={{ color: "var(--accent-2)" }} title="Re-edit this quote">
                        {q.title}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title="Saved before re-edit support">
                        {q.title}
                      </span>
                    )}
                    {q.account && <span className="truncate text-2xs text-muted">{q.account}</span>}
                    <a href={`/api/documents/file?id=${q.id}`} target="_blank" rel="noopener noreferrer"
                      className="whitespace-nowrap text-2xs text-muted hover:text-fg">PDF ↗</a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

function LineItemCard({
  item, index, count, expanded, onToggle, onPatch, onRemove, onMove,
}: {
  item: UiLineItem;
  index: number;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<UiLineItem>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const ask =
    !item.custom && Boolean(item.partNo) && inferSterility(item.partNo, item.title).ask && !item.closing;
  const bg = item.custom ? "#FFFBF5" : undefined;

  return (
    <div className="card p-0" style={{ background: bg }}>
      <div className="flex items-center gap-3 px-3 py-2">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="font-mono text-xs text-muted">{item.quantity || "?"}×</span>
          <span className="font-mono text-xs text-fg">{item.partNo || "(no PN)"}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.title || "(untitled)"}</span>
          <span className="font-mono text-xs text-fg">{item.price || "—"}</span>
        </button>
        <div className="flex items-center gap-1.5">
          {item.custom && <span className="chip text-2xs">Custom</span>}
          {ask && <span className="chip text-2xs text-amber-600">Ask</span>}
          <button onClick={() => onMove(-1)} disabled={index === 0}
            className="px-1 text-xs text-muted hover:text-fg disabled:opacity-30">↑</button>
          <button onClick={() => onMove(1)} disabled={index === count - 1}
            className="px-1 text-xs text-muted hover:text-fg disabled:opacity-30">↓</button>
          <button onClick={onRemove} className="px-1 text-xs text-muted hover:text-danger">✕</button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quantity">
              <input className="input mt-1 w-full" value={item.quantity}
                onChange={(e) => onPatch({ quantity: e.target.value })} />
            </Field>
            <Field label="Part No.">
              <input className="input mt-1 w-full font-mono" value={item.partNo}
                onChange={(e) => onPatch({ partNo: e.target.value })} />
            </Field>
            <Field label="Title">
              <input className="input mt-1 w-full" value={item.title}
                onChange={(e) => onPatch({ title: e.target.value })} />
            </Field>
            <Field label="Price/ea.">
              <input className="input mt-1 w-full font-mono" value={item.price}
                onChange={(e) => onPatch({ price: e.target.value })} />
            </Field>
          </div>

          <Field label="Attributes (one per line)">
            <textarea className="input mt-1 w-full text-sm" rows={4}
              value={item.attributes.join("\n")}
              onChange={(e) => onPatch({ attributes: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
          </Field>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Closing (sterility)">
              <select className="input mt-1 w-full" value={item.closing}
                onChange={(e) => onPatch({ closing: e.target.value as Closing })}>
                {CLOSINGS.map((c) => (
                  <option key={c} value={c}>{c || "(none)"}</option>
                ))}
              </select>
            </Field>
            <label className="mt-1 flex items-center gap-2 self-end text-sm">
              <input type="checkbox" checked={item.leadStacked}
                onChange={(e) => onPatch({ leadStacked: e.target.checked })} />
              <span className="text-muted">Stacked &quot;In Stock / or&quot;</span>
            </label>
          </div>

          {item.leadStacked ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Stock label">
                <input className="input mt-1 w-full" value={item.leadStock}
                  onChange={(e) => onPatch({ leadStock: e.target.value })} />
              </Field>
              <Field label="Alternate lead">
                <input className="input mt-1 w-full" value={item.leadAlt}
                  onChange={(e) => onPatch({ leadAlt: e.target.value })} />
              </Field>
            </div>
          ) : (
            <Field label="Lead time">
              <input className="input mt-1 w-full" value={item.leadTime}
                placeholder="e.g. 4-6 weeks, or 'in stock or 6-8 weeks'"
                onChange={(e) => onPatch({ leadTime: e.target.value })} />
            </Field>
          )}

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={item.custom}
              onChange={(e) => onPatch({ custom: e.target.checked })} />
            <span className="text-muted">Custom item (no auto sterility / stacking)</span>
          </label>
        </div>
      )}
    </div>
  );
}

// ---- Client helpers ------------------------------------------------------

function deriveTitleClient(description: string): string {
  return description.replace(/[®™©]/g, "").trim().split(/\s+/).slice(0, 6).join(" ");
}

// Convert any date string (ISO or "Month Day, Year") to ISO YYYY-MM-DD for the
// date picker. Returns "" when unparseable.
function toISO(input: string | undefined): string {
  if (!input) return "";
  const p = parseDateParts(input);
  if (!p) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

function validateClient(meta: Meta, items: UiLineItem[], quoteId: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!meta.customerName.trim()) errors.push("Customer name is required.");
  if (!meta.customerContact.trim()) errors.push("Contact (Quoted For) is required.");
  if (!meta.quoteDate.trim()) errors.push("Quote date is required.");
  if (!meta.quoteShort.trim()) errors.push("Quote tag is required.");
  if (!quoteId.trim()) errors.push("Quote ID could not be derived.");
  if (items.length === 0) errors.push("At least one line item is required.");

  const seen = new Map<string, number>();
  items.forEach((it, i) => {
    const n = i + 1;
    if (!it.quantity.trim()) errors.push(`Line ${n}: quantity is required.`);
    if (!it.price.trim()) errors.push(`Line ${n}: price is required.`);
    if (!it.title.trim()) errors.push(`Line ${n}: a title is required.`);
    if (it.leadStacked) {
      if (!it.leadAlt.trim()) errors.push(`Line ${n}: stacked lead needs an alternate.`);
    } else if (!it.leadTime.trim()) {
      errors.push(`Line ${n}: a lead time is required.`);
    }
    const pn = it.partNo.trim().toUpperCase();
    if ((pn === "NRE" || pn.startsWith("TBD")) && !leadSet(it)) {
      errors.push(`Line ${n}: ${it.partNo} requires an explicit lead time.`);
    }
    if (it.partNo.length > 16) warnings.push(`Line ${n}: part number is long and may overflow.`);
    const key = it.partNo.trim().toLowerCase();
    if (key) {
      const prev = seen.get(key);
      if (prev) warnings.push(`Lines ${prev} and ${n} share part number "${it.partNo}".`);
      else seen.set(key, n);
    }
  });
  return { errors, warnings };
}

function leadSet(it: UiLineItem): boolean {
  return it.leadStacked ? Boolean(it.leadAlt.trim()) : Boolean(it.leadTime.trim());
}
