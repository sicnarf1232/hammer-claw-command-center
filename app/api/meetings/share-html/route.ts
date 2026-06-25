import { NextResponse, type NextRequest } from "next/server";
import {
  vaultConfigured,
  getMeetingNoteByPath,
  getSeriesByPath,
  getSeriesView,
  getRoster,
} from "@/lib/vault";
import type { Roster } from "@/lib/vault/types";
import { listAccounts } from "@/lib/accounts";
import { workstreamFromPath } from "@/lib/taskView";
import { resolveBrandKit } from "@/lib/branding";
import { meetingToDoc, seriesToDoc } from "@/lib/meetingTemplate";
import { renderShareHtml } from "@/lib/meetingExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The client-branded Copy-for-email HTML, rendered from the shared template.
// react-dom/server lives here (a route handler), not in the RSC page graph.
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const seriesPath = typeof body?.seriesPath === "string" ? body.seriesPath : "";

  try {
    const [accounts, roster] = await Promise.all([
      listAccounts().catch(() => []),
      getRoster().catch(() => new Map() as Roster),
    ]);

    let html: string | null = null;
    let filename = "film-room";

    if (seriesPath) {
      const series = await getSeriesByPath(seriesPath);
      if (series) {
        const view = await getSeriesView(series).catch(() => ({
          outstanding: [],
          closed: [],
          sessions: [],
          stats: { attendance: [], sessions: 0, actionsOpen: 0, actionsClosed: 0, decisions: 0 },
        }));
        const brand = await resolveBrandKit(workstreamFromPath(series.path));
        const model = seriesToDoc(series, view, {
          roster,
          accounts,
          eyebrowLead: brand.workstreamKey ? brand.name : "Film Room",
        });
        filename = model.filenameBase;
        html = renderShareHtml(model, brand);
      }
    } else if (path) {
      const note = await getMeetingNoteByPath(path);
      if (note) {
        const brand = await resolveBrandKit(workstreamFromPath(note.path));
        const model = meetingToDoc(note, {
          roster,
          accounts,
          eyebrowLead: brand.workstreamKey ? brand.name : "Film Room",
        });
        filename = model.filenameBase;
        html = renderShareHtml(model, brand);
      }
    }

    if (!html) {
      return NextResponse.json(
        { error: "Provide a valid meeting `path` or `seriesPath`." },
        { status: 400 },
      );
    }
    return NextResponse.json({ html, filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to render share HTML.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
