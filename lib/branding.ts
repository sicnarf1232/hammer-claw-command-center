import { getDb, dbConfigured, brandKits } from "@/lib/db";
import { eq } from "drizzle-orm";

// Two-layer branding (Phase 3 PART B). The in-app meeting view uses the APP
// brand; the shared exports (PDF, email HTML) use the resolved CLIENT brand.
// Kits live in the brand_kits table and are resolved by a meeting's workstream;
// no kit -> APP_NEUTRAL fallback. Never restyle the rest of the app UI with these.

export interface BrandKit {
  id?: number;
  name: string;
  workstreamKey: string | null;
  primary: string;
  secondary: string;
  accent: string;
  paper: string; // document background (the "paper"): white, cream, dark, etc.
  logoUrl: string | null;
}

// App neutral brand (also the export fallback when a workstream has no kit).
export const APP_NEUTRAL: BrandKit = {
  name: "App neutral",
  workstreamKey: null,
  primary: "#5145e6",
  secondary: "#1f2937",
  accent: "#5145e6",
  paper: "#ffffff",
  logoUrl: null,
};

// Seeded once so Jordan can open Branding, set the crimson palette + upload the
// Merit logo, and test end to end. Placeholder neutral until he edits it.
export const MERIT_PLACEHOLDER: BrandKit = {
  name: "Merit Medical OEM",
  workstreamKey: "merit",
  primary: "#9ca3af",
  secondary: "#4b5563",
  accent: "#9ca3af",
  paper: "#ffffff",
  logoUrl: null,
};

// Suggested "paper" backgrounds for the note: a few warm light tones and a few
// dark ones. Offered as presets in the Branding picker.
export const PAPERS: { name: string; value: string; dark?: boolean }[] = [
  { name: "White", value: "#ffffff" },
  { name: "Cream", value: "#faf6ec" },
  { name: "Ivory", value: "#f6f1e3" },
  { name: "Sand", value: "#efe6d3" },
  { name: "Parchment", value: "#f2ead6" },
  { name: "Slate", value: "#1f2533", dark: true },
  { name: "Charcoal", value: "#17181c", dark: true },
  { name: "Navy", value: "#15203a", dark: true },
];

// 6-digit hex -> "rgba(r,g,b,a)" for derived tints (soft backgrounds, borders).
export function tint(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Relative luminance (sRGB) of a #rrggbb color, used to pick ink for a paper.
function relLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

export function isDarkPaper(paper: string): boolean {
  return relLuminance(paper) < 0.45;
}

export interface PaperInk {
  fg: string;
  ink2: string;
  muted: string;
  surface2: string;
  line: string;
  line2: string;
  ok: string;
  warm: string;
  warmSoft: string;
  dueSoft: string;
  dueInk: string;
}

// Ink + neutral tokens for a given paper, as translucent overlays so they
// composite correctly over any background (light or dark). Lets the same
// template read well on white, cream, or a dark paper.
export function paperInk(paper: string): PaperInk {
  if (isDarkPaper(paper)) {
    return {
      fg: "#f4f4f5",
      ink2: "rgba(255,255,255,0.80)",
      muted: "rgba(255,255,255,0.56)",
      surface2: "rgba(255,255,255,0.06)",
      line: "rgba(255,255,255,0.14)",
      line2: "rgba(255,255,255,0.24)",
      ok: "#4ade80",
      warm: "#fbbf24",
      warmSoft: "rgba(251,191,36,0.16)",
      dueSoft: "rgba(251,191,36,0.16)",
      dueInk: "#fde68a",
    };
  }
  return {
    fg: "#1f2733",
    ink2: "#374151",
    muted: "#6b7280",
    surface2: "rgba(0,0,0,0.035)",
    line: "rgba(0,0,0,0.10)",
    line2: "rgba(0,0,0,0.16)",
    ok: "#15803d",
    warm: "#b45309",
    warmSoft: "rgba(180,83,9,0.10)",
    dueSoft: "#fef3c7",
    dueInk: "#92400e",
  };
}

// The single theming contract: feed these into the shared template's CSS vars.
export function brandToCssVars(kit: BrandKit): Record<string, string> {
  return {
    "--brand-primary": kit.primary,
    "--brand-secondary": kit.secondary,
    "--brand-accent": kit.accent,
    "--brand-primary-soft": tint(kit.primary, 0.1),
    "--brand-accent-soft": tint(kit.accent, 0.12),
    "--brand-border": tint(kit.primary, 0.35),
  };
}

// Inline `style="--brand-primary: ...; ..."` string for the export HTML root.
export function brandStyleAttr(kit: BrandKit): string {
  return Object.entries(brandToCssVars(kit))
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

// Resolve a meeting's client brand by workstream. Falls back to APP_NEUTRAL when
// the DB is unset or no kit exists for the workstream.
export async function resolveBrandKit(
  workstream: string | null | undefined,
): Promise<BrandKit> {
  if (!dbConfigured() || !workstream) return APP_NEUTRAL;
  try {
    const rows = await getDb()
      .select()
      .from(brandKits)
      .where(eq(brandKits.workstreamKey, workstream))
      .limit(1);
    const r = rows[0];
    return r
      ? {
          id: r.id,
          name: r.name,
          workstreamKey: r.workstreamKey,
          primary: r.primary,
          secondary: r.secondary,
          accent: r.accent,
          paper: r.paper ?? "#ffffff",
          logoUrl: r.logoUrl,
        }
      : APP_NEUTRAL;
  } catch {
    return APP_NEUTRAL;
  }
}

function rowToKit(r: {
  id: number;
  name: string;
  workstreamKey: string | null;
  primary: string;
  secondary: string;
  accent: string;
  paper: string | null;
  logoUrl: string | null;
}): BrandKit {
  return {
    id: r.id,
    name: r.name,
    workstreamKey: r.workstreamKey,
    primary: r.primary,
    secondary: r.secondary,
    accent: r.accent,
    paper: r.paper ?? "#ffffff",
    logoUrl: r.logoUrl,
  };
}

// All saved kits, for the Branding settings page. Empty when no DB.
export async function listBrandKits(): Promise<BrandKit[]> {
  if (!dbConfigured()) return [];
  const rows = await getDb().select().from(brandKits).orderBy(brandKits.name);
  return rows.map(rowToKit);
}

// Whether brand logos are stored in Vercel Blob (hosted URL) vs. inline data URL.
export function brandLogoStorageEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export interface BrandKitInput {
  id?: number;
  name: string;
  workstreamKey: string | null;
  primary: string;
  secondary: string;
  accent: string;
  paper: string;
  logoUrl: string | null;
}

// Create or update a kit. Updates by id, else by its (unique) workstreamKey, so
// re-saving a workstream's kit never trips the unique index. Server-only.
export async function upsertBrandKit(input: BrandKitInput): Promise<BrandKit> {
  const db = getDb();
  let existingId = input.id;
  if (!existingId && input.workstreamKey) {
    const rows = await db
      .select({ id: brandKits.id })
      .from(brandKits)
      .where(eq(brandKits.workstreamKey, input.workstreamKey))
      .limit(1);
    if (rows[0]) existingId = rows[0].id;
  }

  const values = {
    name: input.name.trim(),
    workstreamKey: input.workstreamKey,
    primary: input.primary,
    secondary: input.secondary,
    accent: input.accent,
    paper: input.paper,
    logoUrl: input.logoUrl,
  };

  if (existingId) {
    const [row] = await db
      .update(brandKits)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(brandKits.id, existingId))
      .returning();
    return rowToKit(row);
  }
  const [row] = await db.insert(brandKits).values(values).returning();
  return rowToKit(row);
}

// Insert the Merit placeholder kit if no kit exists for "merit". Server-only.
export async function ensureMeritSeed(): Promise<void> {
  if (!dbConfigured()) return;
  const existing = await resolveBrandKit("merit");
  if (existing.workstreamKey === "merit") return;
  await getDb().insert(brandKits).values({
    name: MERIT_PLACEHOLDER.name,
    workstreamKey: "merit",
    primary: MERIT_PLACEHOLDER.primary,
    secondary: MERIT_PLACEHOLDER.secondary,
    accent: MERIT_PLACEHOLDER.accent,
    paper: MERIT_PLACEHOLDER.paper,
    logoUrl: null,
  });
}
