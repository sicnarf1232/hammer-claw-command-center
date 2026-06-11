"use client";

import { useMemo, useState } from "react";

export interface CatalogEntry {
  partNumber: string;
  description: string;
  unitCost: number | null;
}

interface LineItem {
  partNumber: string;
  description: string;
  qty: number;
  unitCost: number;
}

const BLANK: LineItem = { partNumber: "", description: "", qty: 1, unitCost: 0 };

export default function QuoteBuilder({
  catalog,
}: {
  catalog: CatalogEntry[];
}) {
  const [title, setTitle] = useState("Quote");
  const [customer, setCustomer] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ ...BLANK }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byPart = useMemo(() => {
    const m = new Map<string, CatalogEntry>();
    for (const c of catalog) m.set(c.partNumber, c);
    return m;
  }, [catalog]);

  const total = items.reduce((s, it) => s + it.qty * it.unitCost, 0);

  function update(idx: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }

  function onPartChange(idx: number, partNumber: string) {
    const match = byPart.get(partNumber);
    if (match) {
      update(idx, {
        partNumber,
        description: match.description || items[idx].description,
        unitCost: match.unitCost ?? items[idx].unitCost,
      });
    } else {
      update(idx, { partNumber });
    }
  }

  function addRow() {
    setItems((prev) => [...prev, { ...BLANK }]);
  }
  function removeRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function downloadPdf() {
    setError(null);
    const clean = items.filter((it) => it.partNumber || it.description);
    if (clean.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/quote/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, customer, notes, lineItems: clean }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not generate the PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug(title)}.pdf`;
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
    <div className="max-w-4xl">
      <datalist id="catalog-parts">
        {catalog.map((c) => (
          <option key={c.partNumber} value={c.partNumber}>
            {c.description}
          </option>
        ))}
      </datalist>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-slate-500">Quote title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Customer</span>
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-1 pr-2">Part #</th>
              <th className="py-1 pr-2">Description</th>
              <th className="py-1 pr-2 text-right">Qty</th>
              <th className="py-1 pr-2 text-right">Unit cost</th>
              <th className="py-1 pr-2 text-right">Line total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                <td className="py-1 pr-2">
                  <input
                    list="catalog-parts"
                    value={it.partNumber}
                    onChange={(e) => onPartChange(idx, e.target.value)}
                    className="w-28 rounded-md border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={it.description}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    className="w-full min-w-48 rounded-md border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="py-1 pr-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={it.qty}
                    onChange={(e) => update(idx, { qty: Number(e.target.value) })}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right"
                  />
                </td>
                <td className="py-1 pr-2 text-right">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.unitCost}
                    onChange={(e) =>
                      update(idx, { unitCost: Number(e.target.value) })
                    }
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right"
                  />
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {money(it.qty * it.unitCost)}
                </td>
                <td className="py-1 text-right">
                  <button
                    onClick={() => removeRow(idx)}
                    className="text-xs text-slate-400 hover:text-red-600"
                  >
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={addRow}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
        >
          Add line
        </button>
        <div className="text-sm font-medium text-slate-900">
          Total: {money(total)}
        </div>
      </div>

      <label className="mt-4 block text-sm">
        <span className="text-slate-500">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={downloadPdf}
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Generating…" : "Download Merit OEM PDF"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "quote";
}
