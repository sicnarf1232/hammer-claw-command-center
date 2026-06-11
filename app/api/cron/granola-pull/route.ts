import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { createNotification } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Granola pull (Phase 4): pull recent meeting notes from Granola straight into
// the vault, replacing the Cowork MCP hop. The Granola API token/endpoint Jordan
// wants to pull from has not been provided yet, so this is stubbed behind
// GRANOLA_API_KEY. Without it the job is a clean no-op (PUNCHLIST 7).
//
// TODO(jordan): provide the Granola API token + the endpoint to pull from, plus
// where meeting notes should be filed (account subfolders under <ws>/Meetings/).
// Then this route will: fetch recent meetings, parse to the docs/02 meeting
// contract, and writeFile each new note + append to Meetings-Index.md.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GRANOLA_API_KEY) {
    return NextResponse.json({
      ok: true,
      skipped: "Granola not configured (GRANOLA_API_KEY unset).",
    });
  }

  // Placeholder: configured but the integration is not built yet (needs the
  // endpoint contract). Log it so the gap is visible rather than silent.
  await createNotification({
    kind: "error",
    title: "Granola pull not implemented",
    body: "GRANOLA_API_KEY is set but the pull integration awaits the endpoint contract. See PUNCHLIST.",
    dedupeKey: "granola_not_implemented",
  });
  return NextResponse.json({
    ok: false,
    error: "Granola pull integration not implemented yet. See PUNCHLIST.",
  });
}
