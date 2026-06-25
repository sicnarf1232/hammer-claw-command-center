import { NextResponse, type NextRequest } from "next/server";
import { put } from "@vercel/blob";
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
  for (const k of ["primary", "secondary", "accent"] as const) {
    if (!HEX.test(String(body[k] ?? ""))) {
      return NextResponse.json({ error: `Invalid ${k} color (need #rrggbb).` }, { status: 400 });
    }
  }

  let logoUrl: string | null =
    typeof body.logoUrl === "string" && body.logoUrl ? body.logoUrl : null;

  try {
    if (logoUrl && logoUrl.startsWith("data:") && process.env.BLOB_READ_WRITE_TOKEN) {
      logoUrl = await uploadDataUrl(logoUrl, body.workstreamKey);
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
      logoUrl,
    };
    const kit = await upsertBrandKit(input);
    return NextResponse.json({ kit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save the brand kit.";
    if (/relation .*brand_kits.* does not exist|brand_kits/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "The brand_kits table does not exist yet. Run drizzle/brand-kits.sql in the Neon SQL editor, then try again.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function uploadDataUrl(dataUrl: string, workstreamKey: unknown): Promise<string> {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return dataUrl; // not base64; store as-is
  const contentType = m[1];
  const bytes = Buffer.from(m[2], "base64");
  const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const slug = typeof workstreamKey === "string" && workstreamKey ? workstreamKey : "kit";
  const blob = await put(`branding/${slug}-logo.${ext}`, bytes, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });
  return blob.url;
}
