import { vaultConfigured } from "@/lib/vault";
import { getCatalog } from "@/lib/priceList";
import { listAccounts } from "@/lib/accounts";
import { todayISO } from "@/lib/dates";
import QuoteBuilder, {
  type AccountOption,
  type CatalogEntry,
  type QuoteSeed,
} from "@/components/QuoteBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QuotePage({
  searchParams,
}: {
  searchParams: Promise<{
    customer?: string;
    contact?: string;
    desc?: string;
    parse?: string;
  }>;
}) {
  const sp = await searchParams;
  let catalog: CatalogEntry[] = [];
  let accounts: AccountOption[] = [];
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
    try {
      accounts = (await listAccounts()).map((a) => ({
        name: a.name,
        slug: a.slug,
        contacts: a.contacts.map((c) => c.name).filter(Boolean),
      }));
    } catch {
      /* accounts are optional; the customer field still accepts free text */
    }
  } else {
    note =
      "Vault access is not configured, so the price-list catalog is empty. You can still build a quote with manual line items.";
  }

  const seed: QuoteSeed | undefined =
    sp.customer || sp.contact || sp.desc || sp.parse
      ? {
          customer: sp.customer,
          contact: sp.contact,
          description: sp.desc,
          parseText: sp.parse,
        }
      : undefined;

  return (
    <div>
      <header className="mb-6">
        <h1 className="display-title text-2xl text-fg">Quote</h1>
        <p className="mt-1 text-sm text-muted">
          Build a Merit OEM quotation: add from the price list, paste a quote, or
          enter custom items, then download the redesigned multi-page PDF. A live
          preview shows the exact document.{" "}
          {catalog.length > 0 ? `${catalog.length} catalog parts loaded.` : ""}
        </p>
      </header>
      {note && (
        <div className="card mb-4 max-w-3xl p-3 text-xs text-muted">{note}</div>
      )}
      <QuoteBuilder
        catalog={catalog}
        accounts={accounts}
        today={todayISO()}
        seed={seed}
      />
    </div>
  );
}
