import { listAccounts } from "@/lib/accounts";
import { vaultConfigured } from "@/lib/vault";
import DocumentLibrary from "@/components/DocumentLibrary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Milestone 3 #1: the global document library. Reference material (ISO docs,
// biocomp, drawings, certs, PCNs, specs) retained here instead of buried in
// email, searchable by the brain.
export default async function LibraryPage() {
  const accounts = vaultConfigured() ? await listAccounts().catch(() => []) : [];

  return (
    <div>
      <header className="mb-6">
        <h1 className="display-title text-2xl text-fg">Library</h1>
        <p className="mt-1 text-sm text-muted">
          Reference material for the Merit OEM team: ISO docs, biocompatibility,
          drawings, certificates, OEM PCNs, and spec sheets. Uploaded once,
          searchable forever, and readable by the brain on the Ask page.
        </p>
      </header>
      <DocumentLibrary accountOptions={accounts.map((a) => a.name)} />
    </div>
  );
}
