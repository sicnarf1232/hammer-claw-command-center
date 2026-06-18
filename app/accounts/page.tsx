import { vaultConfigured } from "@/lib/vault";
import { getAccountsHub, type AccountHub } from "@/lib/accounts";
import AccountsHub from "@/components/AccountsHub";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>;
}) {
  if (!vaultConfigured()) {
    return (
      <Page>
        <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />
      </Page>
    );
  }

  let accounts: AccountHub[] = [];
  let today = new Date().toISOString().slice(0, 10);
  let error: string | null = null;
  try {
    const res = await getAccountsHub();
    accounts = res.accounts;
    today = res.today;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the vault.";
  }

  const withNumbers = accounts.filter((a) => a.accountNumber).length;
  const { a: initialSlug } = await searchParams;

  return (
    <Page total={accounts.length} numbered={withNumbers}>
      {error ? (
        <div className="card max-w-2xl border-danger/30 p-5 text-sm text-danger">
          Could not read the vault: {error}
        </div>
      ) : accounts.length === 0 ? (
        <div className="card max-w-2xl p-8 text-center text-sm text-muted">
          No customer accounts found under{" "}
          <code className="font-mono">300 Merit/Customers/</code>.
        </div>
      ) : (
        <AccountsHub accounts={accounts} today={today} initialSlug={initialSlug} />
      )}
    </Page>
  );
}

function Page({
  children,
  total,
  numbered,
}: {
  children: React.ReactNode;
  total?: number;
  numbered?: number;
}) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Accounts
        </h1>
        <p className="mt-1 text-sm text-muted">
          Merit customer accounts
          {total !== undefined ? (
            <>
              {" "}
              · <span className="font-mono tabular-nums text-fg/70">{total}</span>{" "}
              total
              {numbered !== undefined && (
                <>
                  ,{" "}
                  <span className="font-mono tabular-nums text-fg/70">
                    {numbered}
                  </span>{" "}
                  with account numbers
                </>
              )}
            </>
          ) : null}
          .
        </p>
      </header>
      {children}
    </div>
  );
}
