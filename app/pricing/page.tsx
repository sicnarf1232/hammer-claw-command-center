import { sql } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";
import { ensurePricingSchema } from "@/lib/pricing/schema";
import { todayISO } from "@/lib/dates";
import PriceImport from "@/components/PriceImport";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Row {
  id: number;
  accountName: string;
  partNumber: string;
  unitPrice: string;
  currency: string;
  minQty: number;
  effectiveDate: string;
  expires: string | null;
  origin: string;
  superseded: boolean;
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

export default async function PricingPage() {
  if (!dbConfigured()) {
    return <SetupNotice missing={["POSTGRES_URL"]} />;
  }
  await ensurePricingSchema();
  const db = getDb();
  const today = todayISO();

  const [agRows, accountRows] = await Promise.all([
    db.execute(sql`
      select a.id, a.part_number, a.unit_price, a.currency, a.min_qty,
             a.effective_date, a.expires, a.origin, a.superseded_by,
             acc.name as account_name
      from account_price_agreements a
      join accounts acc on acc.id = a.account_id
      order by acc.name, a.part_number, a.min_qty, a.effective_date desc
    `),
    db.execute(sql`select id, name from accounts order by name`),
  ]);

  const agreements: Row[] = rowsOf(agRows).map((r) => ({
    id: Number(r.id),
    accountName: String(r.account_name),
    partNumber: String(r.part_number),
    unitPrice: String(r.unit_price),
    currency: String(r.currency),
    minQty: Number(r.min_qty),
    effectiveDate: String(r.effective_date),
    expires: r.expires == null ? null : String(r.expires),
    origin: String(r.origin),
    superseded: r.superseded_by != null,
  }));
  const accounts = rowsOf(accountRows).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
  }));

  const byAccount = new Map<string, Row[]>();
  for (const a of agreements) {
    const list = byAccount.get(a.accountName) ?? [];
    list.push(a);
    byAccount.set(a.accountName, list);
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="display-title text-[30px] leading-tight text-fg">Pricing</h1>
        <p className="mt-1 text-sm text-muted">
          Account price agreements: what each customer actually pays, by part
          and quantity tier. Agreements beat the catalog when quoting.
          Grandfathered = no expiry, origin legacy.
        </p>
      </header>

      <PriceImport accounts={accounts} />

      {byAccount.size === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          No agreements yet. Import a price list above to get started.
        </div>
      ) : (
        <div className="space-y-5">
          {[...byAccount.entries()].map(([account, rows]) => (
            <section key={account}>
              <h2 className="mb-2 text-sm font-semibold text-fg">{account}</h2>
              <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface2 text-left text-muted">
                      <th className="px-3 py-2 font-semibold">Part</th>
                      <th className="px-3 py-2 font-semibold">Unit price</th>
                      <th className="px-3 py-2 font-semibold">Min qty</th>
                      <th className="px-3 py-2 font-semibold">Effective</th>
                      <th className="px-3 py-2 font-semibold">Expires</th>
                      <th className="px-3 py-2 font-semibold">Origin</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const expired = r.expires != null && r.expires < today;
                      return (
                        <tr
                          key={r.id}
                          className={`border-t border-border ${r.superseded || expired ? "text-muted line-through opacity-60" : "text-fg/85"}`}
                        >
                          <td className="px-3 py-1.5 font-mono">{r.partNumber}</td>
                          <td className="px-3 py-1.5 tabular-nums">
                            {r.currency === "USD" ? "$" : `${r.currency} `}
                            {Number(r.unitPrice).toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums">{r.minQty}</td>
                          <td className="px-3 py-1.5 tabular-nums">{r.effectiveDate}</td>
                          <td className="px-3 py-1.5 tabular-nums">
                            {r.expires ?? <span className="text-ok no-underline">grandfathered</span>}
                          </td>
                          <td className="px-3 py-1.5">{r.origin}</td>
                          <td className="px-3 py-1.5">
                            {r.superseded ? "superseded" : expired ? "expired" : "active"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
