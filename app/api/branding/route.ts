import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/db";
import { listBrandKits, upsertBrandKit, type BrandKitInput } from "@/lib/branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Branding needs POSTGRES_URL." }, { status: 503 });
  }
  return NextResponse.json({ kits: await listBrandKits() });
}

// Create/update a brand kit. The logo arrives as the existing hosted URL
// (unchanged), a freshly-picked data URL, or null. Data URLs are pushed to
// Vercel Blob when BLOB_READ_WRITE_TOKEN is set, else stored inline.
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Branding needs POSTGRES_URL." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "A kit name is required." }, { status: 400 });
  }
  for (const k of ["primary", "secondary", "accent", "paper"] as const) {
    if (!HEX.test(String(body[k] ?? ""))) {
      return NextResponse.json({ error: `Invalid ${k} color (need #rrggbb).` }, { status: 400 });
    }
  }

  let logoUrl: string | null =
    typeof body.logoUrl === "string" && body.logoUrl ? body.logoUrl : null;

  try {
    if (logoUrl && logoUrl.startsWith("data:") && process.env.BLOB_READ_WRITE_TOKEN) {
      logoUrl = await uploadDataUrl(logoUrl);
    }

    const input: BrandKitInput = {
      id: typeof body.id === "number" ? body.id : undefined,
      name: body.name,
      workstreamKey:
        typeof body.workstreamKey === "string" && body.workstreamKey
          ? body.workstreamKey
          : null,
      primary: body.primary,
      secondary: body.secondary,
      accent: body.accent,
      paper: body.paper,
      logoUrl,
    };
    const kit = await upsertBrandKit(input);
    return NextResponse.json({ kit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save the brand kit.";
    if (/does not exist/i.test(message)) {
      // Should self-heal on retry: lib/branding self-provisions brand_kits now.
      return NextResponse.json(
        {
          error:
            "The brand_kits table was missing and is being provisioned. Try again; if this persists, run drizzle/brand-kits.sql in the Neon SQL editor.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Store the logo inline as a data URL. The Blob store is private, and a brand
// logo must be embeddable in the meeting/quote email + PDF (an <img src> that
// Outlook and headless Chromium can load); a private blob URL would not resolve
// in those contexts. Logos are small, so inlining is the right tradeoff.
async function uploadDataUrl(dataUrl: string): Promise<string> {
  return dataUrl;
}
