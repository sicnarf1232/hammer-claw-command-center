import { dbConfigured } from "@/lib/db";
import {
  listBrandKits,
  ensureMeritSeed,
  brandLogoStorageEnabled,
} from "@/lib/branding";
import SetupNotice from "@/components/SetupNotice";
import BrandingManager from "@/components/BrandingManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Phase 3 PART B: manage the client brand kits that theme the shared exports
// (PDF + Copy-for-email). The app UI itself is never restyled by these.
export default async function BrandingPage() {
  if (!dbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-3 text-2xl font-bold text-fg">Branding</h1>
        <SetupNotice missing={["POSTGRES_URL"]} />
        <p className="mt-3 text-sm text-muted">
          Brand kits are stored in Postgres. Once it is provisioned, this page lets
          you set each client&apos;s colors and logo for the meeting exports.
        </p>
      </div>
    );
  }

  // Seed the Merit placeholder so it is ready to edit end to end.
  let kits: Awaited<ReturnType<typeof listBrandKits>> = [];
  let tableMissing = false;
  try {
    await ensureMeritSeed();
    kits = await listBrandKits();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    // Missing table OR the newer "paper" column both surface as "does not exist".
    if (/does not exist/i.test(m) || /brand_kits/i.test(m)) tableMissing = true;
  }

  if (tableMissing) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-3 text-2xl font-bold text-fg">Branding</h1>
        <div
          className="card p-5 text-sm"
          style={{ borderColor: "var(--due)", color: "var(--due-ink)" }}
        >
          <p className="font-semibold">The brand_kits table needs to be set up.</p>
          <p className="mt-1">
            Run <code className="font-mono">drizzle/brand-kits.sql</code> in the Neon
            SQL editor (it is idempotent, and adds the new paper column), then reload
            this page. That sets up just the branding table without the full cutover.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-fg">Branding</h1>
        <p className="mt-1 text-sm text-muted">
          These kits brand the meeting exports (the Download PDF and the
          Copy-for-email HTML), resolved per workstream. The app interface stays on
          its own theme.
        </p>
      </header>
      <BrandingManager kits={kits} blobEnabled={brandLogoStorageEnabled()} />
    </div>
  );
}
