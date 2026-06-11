import { vaultConfigured } from "@/lib/vault";
import { getCatalog } from "@/lib/priceList";
import QuoteBuilder, { type CatalogEntry } from "@/components/QuoteBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QuotePage() {
  let catalog: CatalogEntry[] = [];
  let note: string | null = null;

  if (vaultConfigured()) {
    try {
      const items = await getCatalog();
      catalog = items.map((i) => ({
        partNumber: i.partNumber,
        description: i.description,
        unitCost: i.unitCost,
      }));
      if (catalog.length === 0) {
        note =
          "No price-list items were parsed from 300 Merit/Price List/. You can still build a quote with manual line items. If your price list uses a format other than markdown tables, see PUNCHLIST.";
      }
    } catch {
      note = "Could not read the price list. Building with manual line items.";
    }
  } else {
    note =
      "Vault access is not configured, so the price-list catalog is empty. You can still build a quote with manual line items.";
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Quote
        </h1>
        <p className="text-sm text-slate-500">
          Assemble line items and download a Merit OEM branded PDF, rendered
          server-side. {catalog.length > 0 ? `${catalog.length} catalog parts loaded.` : ""}
        </p>
      </header>
      {note && (
        <div className="card mb-4 max-w-3xl p-3 text-xs text-slate-500">{note}</div>
      )}
      <QuoteBuilder catalog={catalog} />
    </div>
  );
}
