import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { isVaultConfigured } from "@/lib/github";
import { writeBrief, type BriefKind } from "@/lib/briefs";

// Shared handler for the three brief cron routes.
export function briefRoute(kind: BriefKind) {
  return async function GET(req: NextRequest) {
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isVaultConfigured()) {
      return NextResponse.json(
        { error: "Vault access not configured." },
        { status: 503 },
      );
    }
    try {
      const res = await writeBrief(kind);
      return NextResponse.json({ ok: true, ...res });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Brief failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
