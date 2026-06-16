import { vaultConfigured } from "@/lib/vault";
import { getAccountsWithStats, type AccountWithStats } from "@/lib/accounts";
import AccountsGrid from "@/components/AccountsGrid";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountsPage() {
  if (!vaultConfigured()) {
    return (
      <Page>
        <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />
      </Page>
    );
  }

  let accounts: AccountWithStats[] = [];
  let error: string | null = null;
  try {
    const res = await getAccountsWithStats();
    accounts = res.accounts;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read the vault.";
  }

  const withNumbers = accounts.filter((a) => a.accountNumber).length;

  return (
    <Page total={accounts.length} numbered={withNumbers}>
      {error ? (
        <div className="card max-w-2xl border-danger/30 p-5 text-sm text-danger">
          Could not read the vault: {error}
        </div>
      ) : (
        <AccountsGrid accounts={accounts} />
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
