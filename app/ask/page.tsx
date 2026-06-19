import { vaultConfigured } from "@/lib/vault";
import { aiConfigured } from "@/lib/ai";
import AskBrain from "@/components/AskBrain";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AskPage() {
  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Ask</h1>
        <p className="mt-1 text-sm text-muted">
          The brain. Grounded in your vault: accounts, contacts, open tasks, and
          meetings. It answers from real data and tells you when something is not
          in the vault.
        </p>
      </header>
      {!vaultConfigured() ? (
        <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />
      ) : !aiConfigured() ? (
        <SetupNotice missing={["ANTHROPIC_API_KEY"]} />
      ) : (
        <AskBrain />
      )}
    </div>
  );
}
