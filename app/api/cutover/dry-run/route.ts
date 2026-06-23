import { NextResponse } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { gatherAndReconcile } from "@/lib/cutover/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Preview of the DB cutover seed: reconciles the whole vault into the proposed
// people/accounts/meetings/tasks/series shape and returns the diff/merge report.
// Performs NO writes (no DB, no vault). Safe to run any time. (docs/DB-CUTOVER.md)
export async function GET() {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  try {
    const r = await gatherAndReconcile();
    return NextResponse.json({
      ok: true,
      counts: r.report.counts,
      // Samples kept small; full lists are derivable from the seed when applied.
      aliasMerges: r.report.merges.slice(0, 100),
      needsReview: r.report.needsReview.slice(0, 200),
      unresolvedNames: r.report.unresolvedNames.slice(0, 200),
      sampleInternal: r.people
        .filter((p) => p.classification === "internal")
        .slice(0, 25)
        .map((p) => p.fullName),
      sampleCustomersByAccount: r.people
        .filter((p) => p.classification === "customer")
        .slice(0, 40)
        .map((p) => `${p.fullName} → ${p.accountSlug ?? "(no account)"}`),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Dry run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
