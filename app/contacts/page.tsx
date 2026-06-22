import { vaultConfigured, getRoster } from "@/lib/vault";
import { listAccounts } from "@/lib/accounts";
import PersonLink from "@/components/PersonLink";
import { BrandColorSettings } from "@/components/BrandColors";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContactsPage() {
  if (!vaultConfigured()) {
    return <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />;
  }

  const [roster, accounts] = await Promise.all([
    getRoster().catch(() => new Map()),
    listAccounts().catch(() => []),
  ]);

  const internal = Array.from(
    new Set(
      Array.from(roster.values())
        .filter((e) => e.classification === "merit")
        .map((e) => e.name),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const customers = accounts
    .filter((a) => (a.contacts?.length ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const customerCount = customers.reduce((n, a) => n + a.contacts.length, 0);

  return (
    <article className="panel texture mx-auto max-w-5xl overflow-hidden p-6 sm:p-9">
      <h1 className="text-[30px] font-bold leading-tight tracking-tight text-fg">
        Contacts
      </h1>
      <p className="mt-1 text-sm text-muted">
        Everyone across the vault, split by internal team and customers. Click a
        name for their profile and related tasks.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <details open className="card p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-fg">
              Internal team
              <span className="chip" style={{ borderColor: "var(--line-2)" }}>{internal.length}</span>
            </summary>
            {internal.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No internal team found in the roster.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {internal.map((name) => (
                  <PersonLink key={name} name={name} kind="internal" />
                ))}
              </div>
            )}
          </details>

          <details open className="card p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-fg">
              Customers
              <span className="chip" style={{ borderColor: "var(--line-2)" }}>{customerCount}</span>
            </summary>
            {customers.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No customer contacts found.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {customers.map((a) => (
                  <details key={a.slug} className="rounded-[10px] p-2" style={{ background: "var(--surface-2)" }}>
                    <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-fg">
                      {a.name}
                      <span className="chip" style={{ borderColor: "var(--line-2)" }}>{a.contacts.length}</span>
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {a.contacts.map((c, i) => (
                        <PersonLink key={`${c.name}-${i}`} name={c.name} company={a.name} kind="customer" />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </details>
        </div>

        <aside>
          <BrandColorSettings />
        </aside>
      </div>
    </article>
  );
}
